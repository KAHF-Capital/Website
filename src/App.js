import React from 'react';
import Home from './pages/Home';
import LearningModules from './pages/LearningModules';
import Scanner from './pages/Scanner';
import Payment from './pages/Payment.jsx';
import Confirmation from './pages/Confirmation.jsx';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/learning" element={<LearningModules />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/payment" element={<Payment />} />
        <Route path="/confirmation" element={<Confirmation />} />
      </Routes>
    </Router>
  );
}

export default App;
