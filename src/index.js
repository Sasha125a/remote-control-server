const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Хранилище подключенных клиентов
const connectedClients = new Map();

// REST API маршруты
app.use('/api', require('./routes/commands'));

// Socket.io соединения
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Регистрация Windows клиента
  socket.on('register-windows-client', (clientInfo) => {
    connectedClients.set(socket.id, {
      type: 'windows',
      socket: socket,
      info: clientInfo
    });
    console.log('Windows client registered:', clientInfo);
    
    // Отправляем подтверждение
    socket.emit('registration-success', {
      message: 'Windows client registered successfully',
      clientId: socket.id
    });
  });

  // Регистрация Android клиента
  socket.on('register-android-client', (clientInfo) => {
    connectedClients.set(socket.id, {
      type: 'android',
      socket: socket,
      info: clientInfo
    });
    console.log('Android client registered:', clientInfo);
    
    socket.emit('registration-success', {
      message: 'Android client registered successfully',
      clientId: socket.id
    });
  });

  // Получение команды от Android и пересылка на Windows
  socket.on('send-command', (commandData) => {
    console.log('Command received from Android:', commandData);
    
    // Находим все подключенные Windows клиенты
    const windowsClients = Array.from(connectedClients.values())
      .filter(client => client.type === 'windows');
    
    if (windowsClients.length === 0) {
      socket.emit('command-error', {
        message: 'No Windows clients connected'
      });
      return;
    }

    // Отправляем команду первому доступному Windows клиенту
    const targetClient = windowsClients[0];
    targetClient.socket.emit('execute-command', commandData);
    
    // Подтверждаем отправку
    socket.emit('command-sent', {
      message: 'Command sent to Windows client',
      command: commandData
    });
  });

  // Результат выполнения команды от Windows клиента
  socket.on('command-result', (result) => {
    console.log('Command result from Windows:', result);
    
    // Пересылаем результат обратно на Android
    const androidClients = Array.from(connectedClients.values())
      .filter(client => client.type === 'android');
    
    androidClients.forEach(client => {
      client.socket.emit('command-result', result);
    });
  });

  // Отслеживание отключения клиента
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    connectedClients.delete(socket.id);
  });

  // Получение списка подключенных клиентов
  socket.on('get-connected-clients', () => {
    const clients = Array.from(connectedClients.values()).map(client => ({
      type: client.type,
      info: client.info,
      id: client.socket.id
    }));
    
    socket.emit('connected-clients-list', clients);
  });
});

// REST endpoint для проверки статуса
app.get('/health', (req, res) => {
  const clients = Array.from(connectedClients.values()).map(client => ({
    type: client.type,
    info: client.info
  }));
  
  res.json({
    status: 'OK',
    connectedClients: clients.length,
    clients: clients
  });
});

// REST endpoint для отправки команд через HTTP
app.post('/api/command', (req, res) => {
  const { command, parameter, clientId } = req.body;
  
  const commandData = {
    command,
    parameter,
    timestamp: new Date().toISOString(),
    source: 'http'
  };

  // Если указан конкретный клиент
  if (clientId) {
    const targetClient = connectedClients.get(clientId);
    if (targetClient && targetClient.type === 'windows') {
      targetClient.socket.emit('execute-command', commandData);
      return res.json({ 
        success: true, 
        message: 'Command sent to specific client',
        clientId 
      });
    }
  }

  // Ищем любой Windows клиент
  const windowsClients = Array.from(connectedClients.values())
    .filter(client => client.type === 'windows');
  
  if (windowsClients.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No Windows clients connected'
    });
  }

  windowsClients[0].socket.emit('execute-command', commandData);
  
  res.json({
    success: true,
    message: 'Command sent to Windows client',
    clientsAvailable: windowsClients.length
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}`);
});
