# FixMyRoom - ระบบแจ้งซ่อมหอพัก

FixMyRoom เป็นระบบแจ้งปัญหาและซ่อมบำรุงสำหรับหอพัก มีระบบแชทแบบเรียลไทม์สำหรับการสื่อสารระหว่างผู้เช่ากับแอดมิน

## Features

- 🏠 **ระบบแจ้งปัญหา** - ผู้เช่าสามารถแจ้งปัญหาห้องพักพร้อมแนบรูปภาพ
- 💬 **ระบบแชทแบบเรียลไทม์** - สื่อสารระหว่างผู้เช่ากับแอดมินผ่าน WebSocket
- 👤 **ระบบ Login** - แยกบทบาทระหว่าง Admin และ Tenant
- 📊 **หน้า Dashboard Admin** - ดูและจัดการปัญหาทั้งหมด
- 🔔 **แจ้งเตือนสถานะ** - อัปเดตสถานะการซ่อม (รอดำเนินการ, กำลังดำเนินการ, เสร็จสิ้น)

## Tech Stack

- **Backend:** Node.js + Express
- **Frontend:** EJS Templates + Tailwind CSS
- **Database:** MySQL
- **Real-time:** WebSocket (ws)
- **Containerization:** Docker + Docker Compose

## Prerequisites

- Docker
- Docker Compose

## Getting Started

### Production Mode

รัน production environment:

```bash
# Build and start production stack
sudo docker compose -f compose.prod.yml up -d --build

# View logs
sudo docker compose -f compose.prod.yml logs -f web

# Check running containers
sudo docker compose -f compose.prod.yml ps

# Stop services
sudo docker compose -f compose.prod.yml down

# Remove all data (including database)
sudo docker compose -f compose.prod.yml down -v
```

คุณสมบัติ:
- ใช้ Node.js v24.13.0
- Multi-stage build สำหรับ optimized image
- Build Tailwind CSS แบบ minified
- รัน `node index.js` โดยตรง
- ใช้ production dependencies เท่านั้น
- รันด้วย non-root user

### Seed Database

หลังจากรัน compose แล้ว ให้ seed ข้อมูล users ตัวอย่าง:

```bash
sudo docker compose -f compose.prod.yml exec web npm run seed:db
```

## Default Users

หลัง seed database จะได้ user ดังนี้:

### Admin
- Username: `admin`
- Password: `Admin123!`
- ใช้เข้า: `http://localhost:3000/login`

### Tenants
| Username | Password | Room Number |
|----------|----------|-------------|
| 4301_somchai | Tenant123! | 4301 |
| 4302_suda | Tenant123! | 4302 |
| 4303_anan | Tenant123! | 4303 |

## Access URLs

- **Web Application:** http://localhost:3000

## Project Structure

```
FixMyRoom/
├── compose.prod.yml         # Production compose
├── database/
│   └── db.sql              # Database schema
├── web/
│   ├── Dockerfile.prod     # Production Dockerfile (multi-stage)
│   ├── index.js            # Main Express app
│   ├── db.js               # Database connection pool
│   ├── package.json
│   ├── public/             # Static assets
│   │   ├── css/
│   │   ├── images/
│   │   ├── scripts/        # Frontend JS
│   │   └── uploads/        # User uploads
│   ├── routes/             # API routes
│   │   ├── admin/
│   │   └── tennant/
│   ├── scripts/
│   │   └── seed-users.js   # Database seeding script
│   └── templates/          # EJS views
│       ├── admin/
│       ├── tenant/
│       └── partials/
```

## Environment Variables

Default environment variables (ตั้งใน `compose.prod.yml`):

```env
NODE_ENV=production          # development or production
DB_HOST=mysql               # MySQL container hostname
DB_USER=lsupwp              # MySQL user
DB_PASSWORD=P@sword1234!    # MySQL password
DB_NAME=fixmyroom           # Database name
```

## WebSocket for Real-time Chat

แอปพลิเคชันใช้ WebSocket (ws) สำหรับการแชทแบบเรียลไทม์ระหว่าง Admin และ Tenant โดยจะทำการ broadcast ข้อความไปยัง clients ที่เชื่อมต่ออยู่ทั้งหมด

## Troubleshooting

### Permission denied (Docker)

ถ้าเจอ `permission denied` ให้ใช้ `sudo` หรือเพิ่ม user เข้า docker group:

```bash
sudo usermod -aG docker $USER
# จากนั้น logout/login ใหม่
```

### Port already in use

ถ้า port 3000 ถูกใช้งานอยู่แล้ว:

```bash
# หา process ที่ใช้ port
sudo lsof -i :3000

# หรือเปลี่ยน port ใน compose.prod.yml
ports:
  - "3001:3000"  # ใช้ port 3001 แทน
```

### Database connection error

ตรวจสอบว่า MySQL container รันอยู่และ healthy:

```bash
sudo docker compose -f compose.prod.yml ps
sudo docker compose -f compose.prod.yml logs mysql
```

## License

ISC

## Contributors

- **Author:** lsupwp
