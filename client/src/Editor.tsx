import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import MonacoEditor from '@monaco-editor/react';
import { useParams } from 'react-router-dom';

const API =
  'https://collaborativecoderapi.onrender.com';

function Editor() {

  const socketRef = useRef(null);

  const { roomId } = useParams();

  const [code, setCode] = useState(
    `print("Hello World")`
  );

  const [output, setOutput] =
    useState('');

  const [status, setStatus] =
    useState('');

  const [language, setLanguage] =
    useState('python');

  const [userInput, setUserInput] =
    useState('');

useEffect(() => {

  if (!roomId) return;

  const socket = io(API, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity
  });

  socketRef.current = socket;

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
          localStorage.getItem('username')
          || 'Anonymous'
      }
    );

  });

  socket.on(
    'joined',
    (data) => {

      console.log(
        'Joined room:',
        data
      );

    }
  );

  socket.on(
    'code_update',
    (newCode) => {

      setCode(newCode);

    }
  );

  socket.on(
    'code_result',
    (result) => {

      console.log(
        'RESULT:',
        result
      );

      setOutput(
        result.output
      );

      setStatus(
        result.status === 'success'
          ? 'Execution Finished'
          : result.status
      );

    }
  );

  socket.on(
    'disconnect',
    (reason) => {

      console.log(
        '🔴 Disconnected:',
        reason
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
     Run Code
  ============================ */

  const runCode =
    async () => {

      setOutput('');

      setStatus(
        'Running...'
      );

      try {

        await axios.post(
          `${API}/submit`,
          {
            roomId,
            sourceCode: code,
            language,
            input: userInput
          }
        );

      }
      catch (err) {

        console.error(err);

        setStatus(
          'Execution Failed'
        );

      }

    };

  return (

    <div>

      <MonacoEditor
        height="70vh"
        theme="vs-dark"
        language={language}
        value={code}
        onChange={(value) => {

          const updatedCode =
            value || '';

          setCode(updatedCode);

          socketRef.current?.emit(
            'code_change',
            {
              roomId,
              code: updatedCode
            }
          );

        }}
      />

      <textarea
        value={userInput}
        onChange={(e) =>
          setUserInput(
            e.target.value
          )
        }
      />

      <button
        onClick={runCode}
      >
        Run
      </button>

      <div>

        <h3>
          {status}
        </h3>

        <pre>
          {output ||
            'Waiting for output...'}
        </pre>

      </div>

    </div>

  );

}

export default Editor;
