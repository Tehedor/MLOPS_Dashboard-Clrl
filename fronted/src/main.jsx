import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { initSupabase } from './api/supabase'

const queryClient = new QueryClient()

async function bootstrap() {
  try {
    const res = await fetch('/api/config')
    if (res.ok) {
      const { supabase_url, supabase_anon_key } = await res.json()
      initSupabase(supabase_url, supabase_anon_key)
    }
  } catch {
    // backend no disponible — Supabase queda sin configurar
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </React.StrictMode>,
  )
}

bootstrap()
