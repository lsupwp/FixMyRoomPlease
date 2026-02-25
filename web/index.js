const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");
const { WebSocketServer, WebSocket } = require("ws");
const path = require("path");

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "templates"));

app.use(cookieSession({
  name: "session",
  keys: ["secretKey1", "secretKey2"],
  maxAge: 7 * 24 * 60 * 60 * 1000 // 24 hours
}))

app.use((req, res, next) => {
  res.locals.room_number = req.session?.room_number || null;
  res.locals.username = req.session?.username || null;

  if (req.path.startsWith('/login')) {
    return next();
  }

  if (req.path.startsWith('/logout')) {
    return next();
  }

  if (!req.session || !req.session.account_id) {
    return res.redirect('/login');
  }

  if (req.path.startsWith('/admin')) {
    if (req.session.role !== 'admin') {
      return res.status(404).render('404', { role: req.session.role });
    }
    return next();
  }

  if (req.session.role !== 'tenant') {
    return res.status(404).render('404', { role: req.session.role });
  }

  return next();
});

const homeRouter = require("./routes/tennant/home");
const loginRouter = require("./routes/login");
const reportRouter = require("./routes/tennant/report");
const chatRouter = require("./routes/tennant/chat");
const adminRouter = require("./routes/admin/index");
const adminChatRouter = require("./routes/admin/chat");

app.use("/", homeRouter);
app.use("/", loginRouter);
app.use("/", reportRouter);
app.use("/", chatRouter);
app.use("/admin", adminRouter);
app.use("/admin", adminChatRouter);

app.use((req, res) => {
  res.status(404).render("404", { role: req.session?.role });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });
app.set('wss', wss);

// Keep track of connected clients
const clients = new Map();

wss.on("connection", (ws) => {
  console.log("A client connected");
  
  // Store client
  const clientId = Date.now() + Math.random();
  clients.set(clientId, ws);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Received message from client ${clientId}:`, data);
      
      // Broadcast to all other connected clients
      clients.forEach((client, id) => {
        if (id !== clientId && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data));
        }
      });
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  ws.on("close", () => {
    console.log(`Client ${clientId} disconnected`);
    clients.delete(clientId);
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    clients.delete(clientId);
  });
});