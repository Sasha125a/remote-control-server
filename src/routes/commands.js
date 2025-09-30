const express = require('express');
const router = express.Router();

// Хранилище для истории команд (в памяти)
const commandHistory = [];

// Получение истории команд
router.get('/history', (req, res) => {
  res.json({
    success: true,
    history: commandHistory.slice(-50) // Последние 50 команд
  });
});

// Статистика сервера
router.get('/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      totalCommands: commandHistory.length,
      serverUptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = router;
