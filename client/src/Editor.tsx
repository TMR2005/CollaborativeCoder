import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io, { Socket } from 'socket.io-client';
import MonacoEditor from '@monaco-editor/react';
import axios from 'axios';
import {
  Code2,
  Play,
  Home,
  Copy,
  Check,
  Terminal,
  FileInput,
  Settings,
  Loader2,
  Users,
  Save
} from 'lucide-react';
import type { CodeResult, RoomData } from './types';

let socket: Socket;

function Editor() {
  const [userInput, setUserInput] = useState('');
  const [code, setCode] = useState("# Write your Python code here\nprint('Hello World')");
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [language, setLanguage] = useState('python');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomId) return;

    socket = io('https://collaborativecoderapi.onrender.com');
    const userId = localStorage.getItem('userId');

    if (userId) {
      axios.post('https://collaborativecoderapi.onrender.com/verify-room', { roomId, userId });
    }

    const fetchRoomData = async () => {
      try {
        const response = await axios.get<RoomData>(`https://collaborativecoderapi.onrender.com/room/${roomId}`);
        if (response.data) {
          setCode(response.data.code || '');
          setLanguage(response.data.language || 'python');
        }
      } catch (err) {
        console.error('Failed to load room data');
      }
    };

    fetchRoomData();
    socket.emit('join_room', roomId);

    socket.on('code_update', (newCode: string) => {
      setCode(newCode);
    });

    socket.on('code_result', (result: CodeResult) => {
      setOutput(result.output);
      setStatus('Execution Finished');
    });

    return () => {
      socket.off('code_update');
      socket.off('code_result');
      socket.disconnect();
    };
  }, [roomId]);

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    setCode(value);
    if (socket && roomId) {
      socket.emit('code_change', { roomId, code: value });
    }
  };

  const saveCode = async () => {
    if (!roomId) return;
    setSaving(true);
    try {
      await axios.post('https://collaborativecoderapi.onrender.com/save', {
        roomId,
        code,
        language
      });
    } catch (e) {
      console.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runCode = async () => {
    if (!roomId) return;

    setStatus('Running...');
    setOutput('');

    try {
      await saveCode();
      await axios.post('https://collaborativecoderapi.onrender.com/submit', {
        roomId,
        sourceCode: code,
        language: language,
        input: userInput
      });
    } catch (error) {
      console.error(error);
      setStatus('Error sending code');
      setOutput('Failed to execute code. Please try again.');
    }
  };

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getEditorLanguage = () => {
    if (language === 'cpp') return 'cpp';
    return language;
  };

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <nav className="bg-slate-800 border-b border-slate-700 px-4 h-14 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
          >
            <Home className="w-5 h-5" />
          </button>

          <div className="h-6 w-px bg-slate-700" />

          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium text-slate-300">Room:</span>
            <code className="text-xs font-mono text-slate-400 bg-slate-700 px-2 py-1 rounded">
              {roomId?.substring(0, 8)}...
            </code>
            <button
              onClick={copyRoomId}
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Copy Room ID"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-400" />
              ) : (
                <Copy className="w-4 h-4 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-1.5">
            <Settings className="w-4 h-4 text-slate-400" />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-transparent text-sm text-slate-200 outline-none cursor-pointer"
            >
              <option value="python">Python</option>
              <option value="cpp">C++</option>
            </select>
          </div>

          <button
            onClick={saveCode}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>

          <button
            onClick={runCode}
            disabled={status === 'Running...'}
            className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors text-sm font-medium disabled:cursor-not-allowed"
          >
            {status === 'Running...' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Code
              </>
            )}
          </button>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <MonacoEditor
              height="100%"
              language={getEditorLanguage()}
              theme="vs-dark"
              value={code}
              onChange={handleEditorChange}
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                roundedSelection: false,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                padding: { top: 16 }
              }}
            />
          </div>
        </div>

        <div className="w-96 border-l border-slate-700 flex flex-col bg-slate-800">
          <div className="flex-1 flex flex-col border-b border-slate-700">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
              <FileInput className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-200">Input (stdin)</h3>
            </div>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              className="flex-1 bg-slate-900 text-slate-100 p-4 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
              placeholder="Enter input for your program..."
            />
          </div>

          <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-200">Output</h3>
              </div>
              {status && (
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    status === 'Running...'
                      ? 'bg-blue-500/20 text-blue-300'
                      : status === 'Execution Finished'
                      ? 'bg-green-500/20 text-green-300'
                      : 'bg-red-500/20 text-red-300'
                  }`}
                >
                  {status}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-auto bg-slate-900 p-4">
              {output ? (
                <pre className="text-sm font-mono text-slate-100 whitespace-pre-wrap break-words">
                  {output}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <Terminal className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Waiting for output...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-xs text-slate-400 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-3 h-3" />
            <span>Collaborative Mode</span>
          </div>
        </div>
        <div>
          Press Ctrl+S to save • Ctrl+Enter to run
        </div>
      </div>
    </div>
  );
}

export default Editor;
