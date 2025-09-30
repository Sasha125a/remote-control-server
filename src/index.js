const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Хранилище подключенных клиентов
const clients = new Map();

wss.on('connection', (ws) => {
    const clientId = generateClientId();
    console.log('New WebSocket connection:', clientId);

    clients.set(clientId, {
        ws: ws,
        type: null,
        info: null
    });

    // Обработка сообщений от клиента
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(clientId, data);
        } catch (error) {
            console.error('Message parse error:', error);
            sendToClient(ws, {
                type: 'error',
                data: { message: 'Invalid JSON format' }
            });
        }
    });

    // Обработка отключения
    ws.on('close', () => {
        console.log('Client disconnected:', clientId);
        clients.delete(clientId);
        broadcastClientsList();
    });

    // Обработка ошибок
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(clientId);
    });

    // Отправляем приветственное сообщение
    sendToClient(ws, {
        type: 'connection-established',
        data: { clientId, message: 'Connected to server' }
    });
});

function handleMessage(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    switch (message.type) {
        case 'register-client':
            handleClientRegistration(clientId, message.data);
            break;
            
        case 'command-result':
            handleCommandResult(message.data);
            break;
            
        case 'ping':
            sendToClient(client.ws, { type: 'pong' });
            break;
            
        case 'pong':
            // Обработка pong (можно обновить время последней активности)
            break;
            
        default:
            console.log('Unknown message type:', message.type);
    }
}

function handleClientRegistration(clientId, clientInfo) {
    const client = clients.get(clientId);
    if (!client) return;

    client.type = clientInfo.clientType;
    client.info = clientInfo;
    
    console.log(`Client registered: ${clientInfo.clientType} - ${clientInfo.hostname}`);
    
    sendToClient(client.ws, {
        type: 'registration-success',
        data: { 
            message: `${clientInfo.clientType} client registered successfully`,
            clientId 
        }
    });
    
    broadcastClientsList();
}

function handleCommandResult(result) {
    // Пересылаем результат всем Android клиентам
    clients.forEach((client, clientId) => {
        if (client.type === 'android') {
            sendToClient(client.ws, {
                type: 'command-result',
                data: result
            });
        }
    });
}

// Функция для отправки команды на Windows клиент
function sendCommandToWindows(command, parameter = null) {
    let sent = false;
    
    clients.forEach((client, clientId) => {
        if (client.type === 'windows' && !sent) {
            sendToClient(client.ws, {
                type: 'execute-command',
                data: { command, parameter }
            });
            sent = true;
        }
    });
    
    return sent;
}

function broadcastClientsList() {
    const clientsList = Array.from(clients.values())
        .filter(client => client.type)
        .map(client => ({
            type: client.type,
            info: client.info
        }));
    
    clients.forEach((client) => {
        if (client.type === 'android') {
            sendToClient(client.ws, {
                type: 'clients-update',
                data: { clients: clientsList }
            });
        }
    });
}

function sendToClient(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function generateClientId() {
    return Math.random().toString(36).substring(2, 15);
}

// REST endpoint для отправки команд через HTTP
app.post('/api/command', (req, res) => {
    const { command, parameter } = req.body;
    
    if (!command) {
        return res.status(400).json({ error: 'Command is required' });
    }
    
    const sent = sendCommandToWindows(command, parameter);
    
    if (sent) {
        res.json({ 
            success: true, 
            message: 'Command sent to Windows client',
            command 
        });
    } else {
        res.status(404).json({ 
            success: false, 
            error: 'No Windows clients connected' 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    const windowsClients = Array.from(clients.values())
        .filter(client => client.type === 'windows').length;
        
    const androidClients = Array.from(clients.values())
        .filter(client => client.type === 'android').length;
    
    res.json({
        status: 'OK',
        connectedClients: clients.size,
        windowsClients,
        androidClients,
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
    console.log(`REST API available at http://localhost:${PORT}`);
});
