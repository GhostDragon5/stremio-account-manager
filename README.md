# Stremio Account Manager

A self-hosted web application for managing multiple Stremio accounts and their addons. Deploy on your own server and access from any device in your network.

> :warning: **Disclaimer**: This is an **unofficial tool** and is not affiliated with Stremio. Use at your own risk. Always keep backups of your important data.

## Features

- **Self-hosted** - Run on your own server with Docker
- **Multiple account management** - Manage 1-10+ Stremio accounts from one interface
- **Saved addons library** - Save addons from accounts or create manually, then apply to all accounts
- **Tag organization** - Organize addons with tags and apply/remove by tag
- **Bulk operations** - Add, remove, or update addons across multiple accounts simultaneously
- **Addon reordering** - Drag-and-drop interface to reorder addons
- **Export/Import** - Backup and restore accounts and saved addons
- **Encrypted storage** - Sensitive data (auth keys, passwords) is encrypted with AES-256-GCM
- **Two-factor authentication** - Secure your account with TOTP

## Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Zustand** - State management
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components

### Backend
- **Node.js** - Server runtime
- **Express** - API framework
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **otplib** - TOTP 2FA
- **AES-256-GCM** - Encryption

## Getting Started

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/GhostDragon5/stremio-account-manager
   cd stremio-account-manager
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   ```

3. **Generate secure keys**
   ```bash
   # Generate JWT_SECRET (64 characters)
   openssl rand -hex 32

   # Generate ENCRYPTION_KEY (64 characters)
   openssl rand -hex 32
   ```
   Add these to your `.env` file:
   ```
   JWT_SECRET=your-64-char-hex-key
   ENCRYPTION_KEY=your-64-char-hex-key
   ```

4. **Start the application**
   ```bash
   docker-compose up -d
   ```

5. **Access the app**
   - Frontend: http://localhost:8080
   - Backend API: http://localhost:5000

### Default Credentials

On first startup, an admin account is created:
- **Username:** admin
- **Password:** admin

**:warning: Change the password immediately after first login!**

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | 64-character hex string for JWT signing | Yes |
| `ENCRYPTION_KEY` | 64-character hex string for AES-256-GCM encryption | Yes |
| `FRONTEND_URL` | URL where the frontend is accessible | No (default: http://localhost:8080) |

### Ports

| Service | Internal | External | Description |
|---------|----------|----------|-------------|
| Frontend | 80 | 8080 | Web UI |
| Backend | 5000 | 5000 | API server |

### Docker Compose

```yaml
services:
  backend:
    ports:
      - "5000:5000"      # API server
    env_file:
      - .env
    volumes:
      - stremio_data:/app/data
      - stremio_logs:/app/logs

  frontend:
    ports:
      - "8080:80"        # Web UI
    depends_on:
      - backend

volumes:
  stremio_data:     # Persistent app data
  stremio_logs:      # Persistent logs
```

## Security Features

- **JWT authentication** with configurable expiration
- **Bcrypt password hashing** (cost factor 12)
- **AES-256-GCM encryption** for stored secrets
- **Rate limiting** on login and sensitive endpoints
- **IP lockout** after failed login attempts
- **Generic error messages** to prevent user enumeration
- **Helmet.js** for HTTP security headers
- **2FA support** (TOTP + backup codes)
- **Docker security** hardening (no-new-privileges, cap_drop ALL)

## Development

### Local Development (without Docker)

```bash
# Install dependencies
npm install

# Start backend (in one terminal)
cd backend
npm install
npm run dev

# Start frontend (in another terminal)
npm run dev
```

### Building for Production

```bash
# Build Docker images
docker-compose build

# Or build frontend only
npm run build
```

## Deployment

### Server Requirements

- Docker CE 20.10+
- Docker Compose v2+
- 512MB RAM minimum
- Linux-based OS recommended

### Network Access

By default, the app binds to all interfaces (`0.0.0.0`), so it's accessible from other devices on your network via `http://<SERVER-IP>:8080`.

#### HTTPS Setup (Recommended for Production)

For access from outside your local network, use a reverse proxy:

1. **Nginx Proxy Manager**
   ```yaml
   # docker-compose.yml
   services:
     proxy:
       image: jc21/nginx-proxy-manager:latest
       ports:
         - "80:80"
         - "443:443"
         - "81:81"  # Admin UI
       volumes:
         - ./proxy/data:/data
         - ./proxy/letsencrypt:/etc/letsencrypt
   ```

2. **Caddy**
   ```yaml
   # Caddyfile
   stremio.example.com {
     reverse_proxy localhost:8080
   }
   ```

## Stopping the Application

```bash
# Stop containers
docker-compose down

# Stop and remove volumes (deletes all data!)
docker-compose down -v
```

## Contributing

Contributions are welcome! Please open a pull request with your changes.

## License

MIT License - see [LICENSE](./LICENSE) file for details.