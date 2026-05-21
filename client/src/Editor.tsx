import { useState, useEffect, useRef } from 'react';
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

import type { RoomData } from './types';

function Editor() {
  const socketRef = useRef<Socket | null>(null);

  const [userInput, setUserInput] = useState('');
  const [code, setCode] = useState(
    "# Write your Python code here\nprint('Hello World')"
  );
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [language, setLanguage] = useState('python');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const API_URL =
    'https://collaborativecoderapi.onrender.com';

  useEffect(() => {
    if (!roomId) return;

    const socket = io(API_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    socketRef.current = socket;

    /* ============================
       Verify User
    ============================ */

    const userId = localStorage.getItem('userId');

    if (userId) {
      axios
        .post(`${API_URL}/verify-room`, {
          roomId,
          userId
        })
        .catch(err => {
          console.error(
            'Verification failed:',
            err
          );
        });
    }

    /* ============================
       Load Room
    ============================ */

    const fetchRoomData = async () => {
      try {
        const response =
          await axios.get<RoomData>(
            `${API_URL}/room/${roomId}`
          );

        if (response.data) {
          setCode(
            response.data.code ||
            "# Write your Python code here\nprint('Hello World')"
          );

          setLanguage(
            response.data.language ||
            'python'
          );
        }

      } catch (err) {
        console.error(
          'Failed to load room:',
          err
        );
      }
    };

    fetchRoomData();

    /* ============================
       Socket Events
    ============================ */

    socket.on('connect', () => {

      console.log(
        '🟢 Connected:',
        socket.id
      );

      socket.emit(
        'join_room',
        {
          roomId,
          username:
            localStorage.getItem(
              'username'
            ) || 'Anonymous'
        }
      );

      console.log(
        `Joined room: ${roomId}`
      );
    });

    socket.on(
      'joined',
      data => {
        console.log(
          'Users in room:',
          data
        );
      }
    );

    socket.on(
      'code_update',
      (newCode: string) => {

        console.log(
          'Code Updated'
        );

        setCode(newCode);
      }
    );

    socket.on(
      'code_result',
      result => {

        console.log(
          'Execution Result:',
          result
        );

        setOutput(
          result.output
        );

        setStatus(
          result.status === 'success'
            ? 'Execution Finished'
            : `Error: ${result.status}`
        );
      }
    );

    socket.on(
      'disconnect',
      () => {

        console.log(
          '🔴 Disconnected'
        );
      }
    );

    return () => {

      socket.off('connect');
      socket.off('joined');
      socket.off('code_update');
      socket.off('code_result');
      socket.off('disconnect');

      socket.disconnect();
    };

  }, [roomId]);

  /* ============================
     Editor Change
  ============================ */

  const handleEditorChange = (
    value: string | undefined
  ) => {

    if (!value) return;

    setCode(value);

    socketRef.current?.emit(
      'code_change',
      {
        roomId,
        code: value
      }
    );
  };

  /* ============================
     Save
  ============================ */

  const saveCode = async () => {

    if (!roomId) return;

    setSaving(true);

    try {

      await axios.post(
        `${API_URL}/save`,
        {
          roomId,
          code,
          language
        }
      );

    } catch(err){

      console.error(
        'Save failed:',
        err
      );

    } finally {

      setSaving(false);
    }
  };

  /* ============================
     Run
  ============================ */

  const runCode = async () => {

    if (!roomId) return;

    setStatus(
      'Running...'
    );

    setOutput('');

    try {

      await saveCode();

      await axios.post(
        `${API_URL}/submit`,
        {
          roomId,
          sourceCode: code,
          language,
          input: userInput
        }
      );

    } catch(err){

      console.error(err);

      setStatus(
        'Execution Failed'
      );

      setOutput(
        'Could not execute code'
      );
    }
  };

  /* ============================
     Copy Room
  ============================ */

  const copyRoomId = () => {

    if (!roomId) return;

    navigator.clipboard.writeText(
      roomId
    );

    setCopied(true);

    setTimeout(
      ()=>setCopied(false),
      2000
    );
  };

  return (
    <div className="h-screen flex flex-col bg-slate-900">

      {/* Navbar */}

      <nav className="bg-slate-800 border-b border-slate-700 px-4 h-14 flex items-center justify-between">

        <div className="flex items-center gap-4">

          <button
            onClick={()=>navigate('/')}
          >
            <Home className="w-5 h-5 text-slate-300"/>
          </button>

          <div className="flex items-center gap-2">

            <Code2 className="w-5 h-5 text-blue-400"/>

            <span className="text-white">
              Room:
            </span>

            <code className="bg-slate-700 px-2 py-1 rounded">

              {roomId?.substring(0,8)}...

            </code>

            <button
              onClick={copyRoomId}
            >
              {copied
                ? <Check/>
                : <Copy/>
              }
            </button>

          </div>

        </div>

        <div className="flex gap-3">

          <select
            value={language}
            onChange={(e)=>
              setLanguage(
                e.target.value
              )
            }
          >
            <option value="python">
              Python
            </option>

            <option value="cpp">
              C++
            </option>
          </select>

          <button
            onClick={saveCode}
          >
            {saving
              ? 'Saving...'
              : 'Save'}
          </button>

          <button
            onClick={runCode}
          >
            {status==="Running..."
              ? 'Running...'
              : 'Run'}
          </button>

        </div>

      </nav>

      <div className="flex flex-1">

        <div className="flex-1">

          <MonacoEditor
            height="100%"
            language={language}
            theme="vs-dark"
            value={code}
            onChange={handleEditorChange}
          />

        </div>

        <div className="w-96 bg-slate-800 flex flex-col">

          <textarea
            value={userInput}
            onChange={e=>
              setUserInput(
                e.target.value
              )
            }
            placeholder="stdin input..."
          />

          <div className="flex-1 p-4">

            <div>
              {status}
            </div>

            <pre className="text-white whitespace-pre-wrap">
              {output ||
                'Waiting for output...'}
            </pre>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Editor;
