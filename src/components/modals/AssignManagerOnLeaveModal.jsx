import { useState, useEffect} from 'react';
import Modal from "./Modal";

function AssignManagerOnLeaveModal({ onLeave, onCancel, members, user }) {
  const [selectedLeader, setSelectedLeader] = useState('');
  const potentialLeaders = members.filter(m => m.id !== user.uid && m.role !== 'Viewer');

  useEffect(() => {
    if (potentialLeaders.length > 0) {
      setSelectedLeader(potentialLeaders[0].id);
    }
  }, []);

  const handleSubmit = () => {
    if (selectedLeader) {
      onLeave(selectedLeader);
    }
  };

  return (
    <Modal onClose={onCancel}>
      <h2 className="text-2xl font-bold mb-4">Assign New Leader</h2>
      <p className="text-gray-300 mb-6">
        You are the only leader in this band. Before you can leave, you must assign a new leader.
      </p>
      <div className="space-y-4">
        <label htmlFor="leader-select" className="block text-sm font-medium text-gray-400">
          Select a new leader:
        </label>
        <select
          id="leader-select"
          value={selectedLeader}
          onChange={(e) => setSelectedLeader(e.target.value)}
          className="w-full bg-gray-700 p-3 rounded-md"
        >
          {potentialLeaders.map(member => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-4 mt-8">
        <button type="button" onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded"
          disabled={!selectedLeader}
        >
          Assign Leader & Leave
        </button>
      </div>
    </Modal>
  );
}

export default AssignManagerOnLeaveModal;