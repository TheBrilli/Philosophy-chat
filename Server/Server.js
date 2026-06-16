const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const messagesDB = [];
const onlineUsers = new Map();

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    let user = null;

    ws.on('message', (raw) => {
        const d = JSON.parse(raw);

        if (d.type === 'join') {
            user = {
                id: uuidv4(),
                name: (d.name || 'Аноним').slice(0, 30),
                publicKey: d.publicKey,
                language: d.language || 'ru'
            };
            onlineUsers.set(ws, user);
            
            ws.send(JSON.stringify({ type: 'joined', userId: user.id, name: user.name }));
            ws.send(JSON.stringify({ type: 'history', messages: messagesDB.slice(-100) }));
            
            broadcast({ type: 'user_list', users: getAllUsers(), count: onlineUsers.size });
            broadcastSystem(`${user.name} вошёл`, ws);
            return;
        }

        if (!user) return;

        if (d.type === 'encrypted_message') {
            const msg = {
                id: uuidv4(),
                type: 'encrypted_message',
                senderId: user.id,
                senderName: user.name,
                encryptedData: d.encryptedData,
                encryptedKeys: d.encryptedKeys,
                iv: d.iv,
                sourceLanguage: d.sourceLanguage || user.language,
                timestamp: new Date().toISOString()
            };
            messagesDB.push(msg);
            if (messagesDB.length > 200) messagesDB.shift();
            broadcast({ type: 'new_encrypted_message', message: msg }, ws);
        }
        else if (d.type === 'typing') {
            broadcast({ type: 'typing_status', userId: user.id, userName: user.name, isTyping: d.isTyping }, ws);
        }
        else if (d.type === 'change_name') {
            user.name = (d.name || 'Аноним').slice(0, 30);
            ws.send(JSON.stringify({ type: 'name_changed', name: user.name }));
            broadcast({ type: 'user_list', users: getAllUsers(), count: onlineUsers.size });
        }
        else if (d.type === 'change_language') {
            user.language = d.language || 'ru';
        }
        else if (d.type === 'request_user_keys') {
            ws.send(JSON.stringify({ type: 'user_keys', users: getAllUsers().filter(u => u.publicKey) }));
        }
    });

    ws.on('close', () => {
        if (user) {
            onlineUsers.delete(ws);
            broadcast({ type: 'user_list', users: getAllUsers(), count: onlineUsers.size });
            broadcastSystem(`${user.name} вышел`);
        }
    });
});

function broadcast(data, exclude) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(c => {
        if (c !== exclude && c.readyState === WebSocket.OPEN) c.send(msg);
    });
}

function broadcastSystem(text, exclude) {
    const msg = {
        id: uuidv4(),
        type: 'system',
        senderId: 'system',
        senderName: 'Система',
        text,
        timestamp: new Date().toISOString()
    };
    messagesDB.push(msg);
    broadcast({ type: 'new_encrypted_message', message: msg }, exclude);
}

function getAllUsers() {
    const users = [];
    onlineUsers.forEach(u => users.push({
        id: u.id,
        name: u.name,
        publicKey: u.publicKey,
        language: u.language
    }));
    return users;
}

server.listen(PORT, () => {
    console.log('Сервер запущен на порту', PORT);
});
