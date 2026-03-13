const { createServer } = require("http");
const { Server } = require("socket.io");
const httpProxy = require("http-proxy");

// Environment variables
const NEXT_SERVER = process.env.NEXT_SERVER_URL || "http://localhost:3000";
const SOCKET_PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : [CLIENT_URL, NEXT_SERVER, "http://localhost:5173", "http://localhost:3000"];

console.log("🚀 Server Configuration:");
console.log("  - Next.js API:", NEXT_SERVER);
console.log("  - Socket.IO Port:", SOCKET_PORT);
console.log("  - Client URL:", CLIENT_URL);
console.log("  - Allowed Origins:", ALLOWED_ORIGINS);

// Create proxy to Next.js server
const proxy = httpProxy.createProxyServer({
  target: NEXT_SERVER,
  ws: true,
  changeOrigin: true,
});

const httpServer = createServer((req, res) => {
  // Proxy HTTP requests to Next.js server
  proxy.web(req, res, (err) => {
    if (err) {
      console.error("Proxy error:", err);
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Bad Gateway - Next.js server not available at ${NEXT_SERVER}`);
    }
  });
});

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

global.io = io;

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Join event room for receiving seat updates
  socket.on("join:event", ({ eventId }) => {
    socket.join(`event:${eventId}`);
    console.log(`Socket ${socket.id} joined event:${eventId}`);
  });

  // Leave event room
  socket.on("leave:event", ({ eventId }) => {
    socket.leave(`event:${eventId}`);
    console.log(`Socket ${socket.id} left event:${eventId}`);
  });

  // Receive seat:update from API server and broadcast to ALL clients
  socket.on("seat:update", (data) => {
    console.log(`[Socket] Received seat:update from API:`, data);
    // Broadcast to ALL clients including sender
    io.emit("seat:update", data);
  });

  // Broadcast seat hold to all clients
  socket.on("seat:hold", (data) => {
    console.log(`[Socket] Seat hold:`, data);
    io.emit("seat:update", {
      seatId: data.seatId,
      status: "HOLD",
      bookingId: data.bookingId,
      userId: data.userId,
      holdUntil: data.holdUntil,
      ts: Date.now(),
    });
  });

  // Broadcast seat booking to all clients
  socket.on("seat:book", (data) => {
    console.log(`[Socket] Seat booked:`, data);
    io.emit("seat:update", {
      seatId: data.seatId,
      status: "BOOKED",
      bookingId: data.bookingId,
      userId: data.userId,
      ts: Date.now(),
    });
  });

  // Broadcast seat release to all clients
  socket.on("seat:release", (data) => {
    console.log(`[Socket] Seat released:`, data);
    io.emit("seat:update", {
      seatId: data.seatId,
      status: "AVAILABLE",
      ts: Date.now(),
    });
  });

  // Handle multiple seats update
  socket.on("seats:bulk-update", (data) => {
    console.log(`[Socket] Bulk seats update:`, data);
    if (data.seats && Array.isArray(data.seats)) {
      data.seats.forEach((seat) => {
        io.emit("seat:update", {
          seatId: seat.seatId,
          status: seat.status,
          bookingId: data.bookingId,
          userId: data.userId,
          ts: Date.now(),
        });
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

httpServer.listen(SOCKET_PORT, () => {
  console.log(`✅ Socket.IO server running on port ${SOCKET_PORT}`);
  console.log(`✅ Proxying HTTP requests to Next.js at ${NEXT_SERVER}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
