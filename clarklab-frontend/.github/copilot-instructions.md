# ClarkLab.tech - Homelab Portal

A tech-themed homelab management portal with public frontend, authentication, and dashboard.

## Project Overview

- **Frontend Framework**: React 19 + Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Design**: Terminal/tech aesthetic with raw command-line vibes
- **Features**: Landing page, login authentication, admin dashboard

## Development Setup

```bash
npm install
npm run dev
```

The dev server runs at http://localhost:5173

## Build

```bash
npm run build
npm run preview
```

## Key Directories

- `/src/components` - React components (UI components, layout)
- `/src/pages` - Page components (LandingPage, LoginPage, DashboardPage)
- `/src/lib` - Utility functions and helpers
- `/src` - Main app and styling

## Architecture

- **Landing Page**: Public entry point with project overview and call-to-action
- **Login Page**: Authentication gateway with demo credentials support
- **Dashboard**: Admin panel showing system metrics, services, and commands
- **Terminal UI**: Custom components styled to mimic terminal/CRT output
- **Routing**: React Router for client-side navigation
- **Auth**: Demo authentication with localStorage (ready for API integration)

## Design Features

- **Dark Terminal Theme**: Deep slate backgrounds with neon green accents
- **Scanline Effect**: CRT-style overlay creating authentic terminal feel
- **Monospace Typography**: Fira Code font for that classic terminal look
- **Command Prompts**: Shell-like syntax (`$`, `>`, etc.) throughout UI
- **Status Indicators**: Terminal-style status messages and logging
- **Responsive Layout**: Works on desktop and mobile devices

## Setup Progress

- [x] Project scaffolded with Vite + React + TypeScript
- [x] Tailwind CSS v4 configured with custom theme
- [x] shadcn/ui components installed (Button component)
- [x] Terminal theme customized with dark palette and glow effects
- [x] Landing page created with feature highlights
- [x] Login page with authentication form
- [x] Dashboard with system metrics and service status
- [x] React Router navigation between pages
- [x] Project builds and runs successfully
- [x] Dev environment running at http://localhost:5173

## Next Steps

- Integrate real authentication API
- Connect to actual homelab APIs for live metrics
- Add more dashboard widgets and controls
- Implement CLI interface for remote access
- Add deployment configuration (Docker, cloud hosting)
