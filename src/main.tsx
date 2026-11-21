import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ProgressProvider } from './progress/ProgressContext';
import { ContentProvider } from './content/ContentContext';
import { FunnelProvider } from './funnels/FunnelContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ContentProvider>
          <ProgressProvider>
            <FunnelProvider>
              <App />
            </FunnelProvider>
          </ProgressProvider>
        </ContentProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
