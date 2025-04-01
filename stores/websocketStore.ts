import { create } from 'zustand';

interface Token {
  type: string;
  input?: string;
  transcription?: string;
  output?: string;
  value?: string;
}

interface WebSocketState {
  tokens: Map<number, Token>;
  wsError: boolean;
  socket: WebSocket | null;
  isConnected: boolean;
  
  // Actions
  connectWebSocket: () => void;
  disconnectWebSocket: () => void;
  sendMessage: (inputLanguage: string, targetLanguage: string, input: string) => void;
  reset: () => void;
}

const useWebSocketStore = create<WebSocketState>((set, get) => ({
  tokens: new Map<number, Token>(),
  wsError: false,
  socket: null,
  isConnected: false,
  
  connectWebSocket: () => {
    if (get().socket !== null) {
      get().socket!.close();
    }
    
    const socket = new WebSocket('wss://gy2rem2fsd.execute-api.us-east-2.amazonaws.com/prod/');
    
    socket.onopen = () => {
      console.log('WebSocket connection established');
      set({ socket, isConnected: true });
    };
    
    socket.onmessage = (event) => {
      console.log('Message received:', event.data);
      
      if (event.data.includes('<end:)>')) {
        socket.close();
        set({ isConnected: false });
      } else if (event.data.includes('<error:/>')) {
        set({ wsError: true, isConnected: false });
        socket.close();
      } else {
        try {
          const token: Token = JSON.parse(event.data);
          
          set((state) => {
            const newTokens = new Map(state.tokens);
            newTokens.set(
              state.tokens.size === 0 ? 0 : Math.max(...Array.from(state.tokens.keys())) + 1, 
              token
            );
            return { tokens: newTokens };
          });
        } catch (error) {
          set({ wsError: true, isConnected: false });
          socket.close();
          console.error('Error parsing response:', error);
        }
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      set({ wsError: true, isConnected: false });
      socket.close();
    };
    
    socket.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      set({ isConnected: false });
    };
    
    set({ socket });
  },
  
  disconnectWebSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
      set({ socket: null, isConnected: false });
    }
  },
  
  sendMessage: (inputLanguage, targetLanguage, input) => {
    const { socket, isConnected } = get();
    
    if (!socket || !isConnected) {
      get().connectWebSocket();
      // Small delay to ensure the socket is connected before sending
      setTimeout(() => {
        const newSocket = get().socket;
        if (newSocket && get().isConnected) {
          const message = {
            action: "translate",
            message: JSON.stringify({
              input_language: inputLanguage,
              target_language: targetLanguage,
              input: input
            })
          };
          newSocket.send(JSON.stringify(message));
        }
      }, 10000);
    } else {
      const message = {
        action: "translate",
        message: JSON.stringify({
          input_language: inputLanguage,
          target_language: targetLanguage,
          input: input
        })
      };
      socket.send(JSON.stringify(message));
    }
  },
  
  reset: () => {
    const { socket } = get();
    if (socket) {
      socket.close();
    }
    set({
      tokens: new Map<number, Token>(),
      wsError: false,
      socket: null,
      isConnected: false
    });
  }
}));

export default useWebSocketStore;
