# Client - Seat Booking Frontend

React-based frontend application for real-time seat booking system built with Vite.

## Tech Stack

- **React** 19.2.3 - UI library
- **Vite** 7.3.1 - Build tool and dev server
- **Socket.IO Client** - Real-time communication
- **Axios** - HTTP client
- **React Router** - Navigation
- **SCSS Modules** - Styling

## Prerequisites

- Node.js 18+ or higher
- npm or yarn package manager

## Installation

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install
```

## Environment Variables

Create a `.env` file in the client directory:

```env
# Backend API URL (proxied through Socket.IO server)
VITE_DEPLOYED_BACKEND_HOSTNAME=http://localhost:3001

# Socket.IO Server URL
VITE_SOCKET_SERVER_URL=http://localhost:3001
```

### Production Environment Variables

For production deployment (Vercel), create `.env.production`:

```env
VITE_DEPLOYED_BACKEND_HOSTNAME=https://your-nextjs-app.vercel.app
VITE_SOCKET_SERVER_URL=https://your-socket-server.onrender.com
```

## Development

```bash
# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

## Build

```bash
# Create production build
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
client/
├── src/
│   ├── api/              # API hooks and utilities
│   │   ├── useSeats.js   # Seat booking API hooks
│   │   └── useUser.js    # User API hooks
│   ├── lib/              # Core utilities
│   │   ├── axios/        # Axios configuration
│   │   ├── socket.js     # Socket.IO client setup
│   │   └── toast/        # Toast notification system
│   ├── pages/            # Application pages
│   │   ├── booking/      # Seat booking page
│   │   └── payment/      # Payment page
│   ├── constants/        # Application constants
│   ├── data/             # Mock data
│   ├── assets/           # Static assets
│   ├── App.jsx           # Root component
│   └── main.jsx          # Application entry point
├── public/               # Public static files
├── .env                  # Environment variables (local)
├── .env.production       # Environment variables (production)
└── package.json          # Dependencies and scripts
```

## Features

### Real-Time Seat Booking

- Live seat availability updates via Socket.IO
- Select up to 4 seats at once
- Visual seat status indicators (Available, Hold, Booked)
- Automatic seat status synchronization across all clients

### Seat Status

- **Available** - Green, can be selected
- **Hold** - Orange with lock icon, temporarily reserved
- **Booked** - Red with X, permanently booked
- **Selected** - Blue highlight, ready to book

### API Integration

All API calls go through the Socket.IO server which proxies to the Next.js backend:

- `GET /api/seats` - Fetch all seats
- `POST /api/book-seat` - Reserve seats (creates hold)
- `POST /api/pay` - Complete payment and confirm booking

### Real-Time Updates

The client automatically receives and applies seat updates:

```javascript
socket.on("seat:update", (data) => {
  // Automatically updates seat status in UI
  // { seatId, status, bookingId, holdUntil, ts }
});
```

## Usage

### Booking Flow

1. User selects available seats (up to 4)
2. Click "Book" button
3. Seats are held for 120 seconds
4. Redirected to payment page
5. Complete payment to confirm booking

### Quick Book

Each section has a "Quick Book" button that randomly selects and books one available seat.

## Development Notes

### Socket Connection

The Socket.IO client automatically connects on mount and handles reconnection:

```javascript
const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});
```

### React Strict Mode

In development, React Strict Mode causes components to mount twice. You may see duplicate socket connections in logs - this is expected and won't happen in production.

### Hot Module Replacement

Vite provides fast HMR. Changes to React components and styles update instantly without full page reload.

## Troubleshooting

### Socket not connecting

- Verify Socket.IO server is running on port 3001
- Check `VITE_SOCKET_SERVER_URL` in `.env`
- Check browser console for connection errors
- Verify CORS settings on server

### API calls failing

- Ensure backend server is running
- Check `VITE_DEPLOYED_BACKEND_HOSTNAME` in `.env`
- Open Network tab in browser DevTools
- Verify server logs for errors

### Seats not updating in real-time

- Check Socket.IO connection status in console
- Verify Socket.IO server is receiving events
- Check server logs for `[Socket] Received seat:update`
- Ensure Redis is running (required for seat holds)

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Deployment

### Vercel Deployment

1. Push code to GitHub repository
2. Import project in Vercel dashboard
3. Set root directory to `client`
4. Add environment variables in Vercel settings
5. Deploy

### Environment Variables in Vercel

Add these in Project Settings > Environment Variables:

- `VITE_DEPLOYED_BACKEND_HOSTNAME` - Your backend API URL
- `VITE_SOCKET_SERVER_URL` - Your Socket.IO server URL

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT
