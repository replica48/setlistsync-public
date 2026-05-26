import { useState, useEffect } from 'react';
import Modal from "./Modal";

function AssignOwnerOnLeaveModal({ onLeave, onCancel, members, user }) {
  const [selectedOwner, setSelectedOwner] = useState('');
  // Filter out the current owner to find potential successors
  const potentialOwners = members.filter(m => m.id !== user.uid);

  // Pre-select the first person in the list
  useEffect(() => {
    if (potentialOwners.length > 0) {
      setSelectedOwner(potentialOwners[0].id);
    }
  }, []);

  const handleSubmit = () => {
    if (selectedOwner) {
      onLeave(selectedOwner);
    }
  };

  return (
    <Modal onClose={onCancel}>
      <h2 className="text-2xl font-bold mb-4">Assign a New Band Owner</h2>
      <p className="text-gray-300 mb-6">
        As the band owner, you must assign a new owner before you can leave.
      </p>
      <div className="space-y-4">
        <label htmlFor="owner-select" className="block text-sm font-medium text-gray-400">
          Select the new owner:
        </label>
        <select
          id="owner-select"
          value={selectedOwner}
          onChange={(e) => setSelectedOwner(e.target.value)}
          className="w-full bg-gray-700 text-white p-3 rounded-md"
        >
          {potentialOwners.map(member => (
            <option key={member.id} value={member.id}>
              {member.name} ({member.role})
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
          className="bg-sky-600 hover:bg-sky-500 text-white font-bold py-2 px-4 rounded"
          disabled={!selectedOwner}
        >
          Assign Owner & Leave
        </button>
      </div>
    </Modal>
  );
}

export default AssignOwnerOnLeaveModal;