# Ollama Chatbot

A simple web-based chatbot interface for Ollama using Node.js and HTML.

## Features

- Modern, responsive chat interface
- Model selection (Llama 2, Mistral, Code Llama, etc.)
- Real-time typing indicators
- Error handling and connection status
- Mobile-friendly design

## Prerequisites

1. **Ollama** - Make sure Ollama is installed and running on your system
   - Download from: https://ollama.ai/
   - Start Ollama service: `ollama serve`
   
2. **Node.js** - Version 14 or higher
   - Download from: https://nodejs.org/

3. **At least one Ollama model** - Pull a model to use
   ```bash
   ollama pull llama2
   # or
   ollama pull mistral
   # or
   ollama pull codellama
   ```

## Installation

1. Clone or download this project
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Make sure Ollama is running:
   ```bash
   ollama serve
   ```

2. Start the chatbot server:
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Project Structure

```
ollama-chatbot/
├── package.json          # Node.js dependencies
├── server.js             # Express server with Ollama API integration
├── public/               # Frontend files
│   ├── index.html        # Main HTML page
│   ├── style.css         # Styling
│   └── script.js         # Frontend JavaScript
└── README.md             # This file
```

## API Endpoints

- `GET /` - Serve the main chat interface
- `POST /api/chat` - Send message to Ollama and get response
- `GET /api/models` - Get list of available Ollama models

## Configuration

The server runs on port 3000 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

The Ollama API endpoint is configured to `http://localhost:11434`. If your Ollama instance is running on a different host or port, modify the `OLLAMA_API` constant in `server.js`.

## Troubleshooting

### "Could not connect to Ollama" error
- Make sure Ollama is running: `ollama serve`
- Check if Ollama is accessible on http://localhost:11434
- Verify you have at least one model installed: `ollama list`

### "No models available"
- Pull a model first: `ollama pull llama2`
- Check installed models: `ollama list`

### Server won't start
- Check if port 3000 is already in use
- Try a different port: `PORT=3001 npm start`

## Customization

You can easily customize the chat interface by modifying:
- `public/style.css` - Change colors, layout, and styling
- `public/index.html` - Modify the HTML structure
- `public/script.js` - Add new frontend features
- `server.js` - Modify API endpoints and Ollama integration

## License

MIT License
