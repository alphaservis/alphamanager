    import React from 'react';
    import ReactDOM from 'react-dom/client';
    import App from './App'; // Uvozi vašu glavnu App komponentu

    // Stvara korijen React aplikacije i renderira App komponentu
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    