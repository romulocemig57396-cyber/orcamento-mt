import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Raiz from './auth/Raiz.jsx'
import './index.css'

// `Raiz` envolve o app com a camada de autenticação (AuthProvider + RequireAuth)
// SOMENTE quando o Entra ID está configurado (variáveis VITE_). Sem configuração
// (ambiente local atual), renderiza o app diretamente, sem exigir login.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Raiz>
      <App />
    </Raiz>
  </React.StrictMode>,
)
