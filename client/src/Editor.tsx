import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import MonacoEditor from '@monaco-editor/react';
import { useParams } from 'react-router-dom';

const API =
'https://collaborativecoderapi.onrender.com';

function Editor(){

const socketRef=useRef(null);

const {roomId}=useParams();

const [code,setCode]=useState(
`print("Hello World")`
);

const [output,setOutput]=
useState('');

const [status,setStatus]=
useState('');

const [language,setLanguage]=
useState('python');

const [userInput,setUserInput]=
useState('');

useEffect(()=>{

if(!roomId)return;

const socket=io(
API,
{
transports:['websocket'],
reconnection:true,
reconnectionAttempts:Infinity,
timeout:20000
}
);

socketRef.current=socket;

socket.on(
'connect',
()=>{

console.log(
'Connected:',
socket.id
);

socket.emit(
'join_room',
{
roomId,
username:
localStorage.getItem(
'username'
)
||
'Anonymous'
}
);

}
);

socket.on(
'code_update',
newCode=>{

setCode(
newCode
);

}
);

socket.on(
'code_result',
result=>{

console.log(
'RESULT:',
result
);

setOutput(
result.output
);

setStatus(
result.status==='success'
?
'Execution Finished'
:
result.status
);

}
);

return ()=>{

socket.off(
'connect'
);

socket.off(
'code_update'
);

socket.off(
'code_result'
);

socket.disconnect();

};

},[roomId]);

const runCode=
async()=>{

setOutput('');

setStatus(
'Running...'
);

try{

await axios.post(
`${API}/submit`,
{
roomId,
sourceCode:
code,
language,
input:
userInput
}
);

}
catch(err){

console.error(err);

setStatus(
'Execution Failed'
);

}

};

return(

<div>

<MonacoEditor
height="70vh"
theme="vs-dark"
language={language}
value={code}
onChange={value=>{

setCode(value);

socketRef.current?.
emit(
'code_change',
{
roomId,
code:value
}
);

}}
/>

<textarea
value={userInput}
onChange={e=>
setUserInput(
e.target.value
)
}
/>

<button
onClick={
runCode
}
>
Run
</button>

<div>

<h3>
{status}
</h3>

<pre>
{output}
</pre>

</div>

</div>

);

}

export default Editor;
