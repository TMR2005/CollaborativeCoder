import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { Code2, LogOut, Plus, ArrowRight, Clock, Users } from 'lucide-react';
import type { UserRoomsResponse } from './types';

function Home() {
  const [roomId, setRoomId] = useState('');
  const [myRooms, setMyRooms] = useState<string[]>([]);
  const navigate = useNavigate();

  const username = localStorage.getItem('username');
  const userId = localStorage.getItem('userId');

  useEffect(() => {
    if (userId) {
      axios.get<UserRoomsResponse>(`http://localhost:5000/user-rooms/${userId}`)
        .then(res => setMyRooms(res.data.rooms))
        .catch(err => console.error(err));
    }
  }, [userId]);

  const createNewRoom = () => {
    const id = uuidv4();
    navigate(`/editor/${id}`);
  };

  const joinRoom = () => {
    if (!roomId.trim()) return;
    navigate(`/editor/${roomId}`);
  };

  const logout = () => {
    localStorage.clear();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg">
                <Code2 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">CodeCollab</h1>
            </div>

            {username && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-lg">
                  <Users className="w-4 h-4 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">{username}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">
            Code Together, Build Better
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Real-time collaborative coding platform with instant code execution
          </p>
        </div>

        {!username ? (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg border border-slate-200 p-8 mb-8">
            <h3 className="text-xl font-semibold text-slate-900 mb-4 text-center">
              Get Started
            </h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => navigate('/register')}
                className="w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-700 font-medium rounded-lg border-2 border-slate-200 transition-colors"
              >
                Create Account
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">Recent Rooms</h3>
              </div>

              {myRooms.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {myRooms.map(room => (
                    <button
                      key={room}
                      onClick={() => navigate(`/editor/${room}`)}
                      className="group p-4 bg-slate-50 hover:bg-blue-50 border-2 border-slate-200 hover:border-blue-300 rounded-xl transition-all text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Room ID</p>
                          <p className="font-mono text-sm font-medium text-slate-900 group-hover:text-blue-600">
                            {room.substring(0, 8)}...
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transform group-hover:translate-x-1 transition-all" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Code2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No recent rooms found. Create one to get started!</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
            <h3 className="text-xl font-semibold text-slate-900 mb-6 text-center">
              Join or Create a Room
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Room ID
                </label>
                <input
                  type="text"
                  placeholder="Enter room ID to join existing session"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />
              </div>

              <button
                onClick={joinRoom}
                disabled={!roomId.trim()}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Join Room
                <ArrowRight className="w-5 h-5" />
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-slate-500 font-medium">OR</span>
                </div>
              </div>

              <button
                onClick={createNewRoom}
                className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Create New Room
              </button>
            </div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center">
            <div className="bg-blue-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Code2 className="w-6 h-6 text-blue-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Multi-Language Support</h4>
            <p className="text-sm text-slate-600">Write code in Python, C++, and more</p>
          </div>

          <div className="text-center">
            <div className="bg-green-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-green-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Real-Time Collaboration</h4>
            <p className="text-sm text-slate-600">Code together with instant sync</p>
          </div>

          <div className="text-center">
            <div className="bg-orange-100 w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4">
              <ArrowRight className="w-6 h-6 text-orange-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-2">Instant Execution</h4>
            <p className="text-sm text-slate-600">Run code and see results immediately</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Home;
