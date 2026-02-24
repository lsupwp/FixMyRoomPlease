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

  if (!req.session || !req.session.account_id) {
    return res.redirect('/login');
  }

  if (req.path.startsWith('/admin')) {
    if (req.session.role !== 'admin') {
      return res.redirect('/login');
    }
    return next();
  }

  if (req.session.role !== 'tenant') {
    return res.redirect('/login');
  }

  return next();
});

const homeRouter = require("./routes/tennant/home");
const loginRouter = require("./routes/tennant/login");
const reportRouter = require("./routes/tennant/report");
const chatRouter = require("./routes/tennant/chat");

app.use("/", homeRouter);
app.use("/", loginRouter);
app.use("/", reportRouter);
app.use("/", chatRouter);

app.use((req, res) => {
  res.status(404).render("404", { title: "ไม่พบหน้านี้" });
});

const server = app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("A client connected");

  ws.on("message", (message) => {
    console.log(`Received message: ${message}`);
    // Broadcast the message to all connected clients
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on("close", () => {
    console.log("A client disconnected");
  });
});