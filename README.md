# KAHF Capital Volatility Platform

A React-based website for KAHF Capital's volatility trading platform.

## Features

- Home page with platform overview
- Learning modules for volatility trading education
- Payment processing for e-book purchases
- Responsive design with modern UI

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repository-url>
cd Website-main
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000).

## Deployment

### Netlify

1. Connect your GitHub repository to Netlify
2. The `netlify.toml` file is already configured
3. Deploy automatically on push to main branch

### Vercel

1. Connect your GitHub repository to Vercel
2. The `vercel.json` file is already configured
3. Deploy automatically on push to main branch

### Manual Build

```bash
npm run build
```

This creates a `build` folder with production-ready files.

## Project Structure

```
Website-main/
├── public/
│   └── index.html
├── src/
│   ├── App.js
│   ├── App.css
│   ├── index.js
│   └── index.css
├── pages/
│   ├── Home.jsx
│   ├── LearningModules.jsx
│   └── Payment.jsx
├── package.json
├── netlify.toml
├── vercel.json
└── .gitignore
```

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm run build` - Builds the app for production
- `npm test` - Launches the test runner
- `npm run eject` - Ejects from Create React App (irreversible)

## Dependencies

- React 18.2.0
- React Router DOM 6.8.0
- Lucide React 0.400.0
- Framer Motion 10.16.0

