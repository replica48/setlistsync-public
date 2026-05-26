import { useState, useEffect, useRef } from "react";
import { IconButton } from "@mui/material";
import {
  RetroMicIcon,
  MusicIcon,
  UsersIcon,
  MenuIcon,
  SignOutIcon,
  SwitchBandIcon,
  UserIcon,
  ClipboardIcon,
  ListMusicIcon,
} from "../helpers/Icons";

function AppSidebar({
  isCollapsed,
  closeSidebar,
  currentView,
  setCurrentView,
  handleSignOut,
  switchActiveBand,
  onProfileClick,
}) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Click-outside-to-close logic for the bottom "Profile" menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuRef]);

  const NavItem = ({ icon, label, view }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        closeSidebar(); // Auto-close sidebar after selection
      }}
      className={`flex items-center w-full text-left p-3 rounded-md transition-colors ${
        currentView === view
          ? "bg-sky-500 text-white"
          : "text-gray-300 hover:bg-gray-700"
      }`}
    >
      {icon}
      <span className="ml-3 transition-opacity duration-200">{label}</span>
    </button>
  );

  return (
    // --- UPDATED: Sidebar is now a fixed-position drawer ---
    <aside
      className={`bg-gray-800 p-4 md:p-6 flex flex-col justify-between h-screen fixed top-0 left-0 z-30 transition-transform duration-300 w-64
                ${isCollapsed ? "-translate-x-full" : "translate-x-0"}
            `}
    >
      <div>
        <div className="flex items-center gap-4 mb-4">
          <IconButton onClick={closeSidebar} sx={{ color: "white" }}>
            <MenuIcon />
          </IconButton>
          <h1 className="text-3xl font-bold invisible">-</h1>
        </div>
        <nav className="flex flex-col gap-2">
          <NavItem icon={<RetroMicIcon />} label="Live View" view="live" />
          <NavItem
            icon={<ListMusicIcon />}
            label="Practice Time"
            view="practice"
          />
          <NavItem icon={<MusicIcon />} label="Songs & Sets" view="songs" />
          <NavItem icon={<ClipboardIcon />} label="Notes" view="notes" />
          <NavItem icon={<UsersIcon />} label="Band Settings" view="members" />
        </nav>
      </div>

      <div ref={userMenuRef} className="relative">
        {isUserMenuOpen && (
          <div className="absolute left-0 w-48 bg-gray-700 rounded-md shadow-lg py-1 z-10 bottom-16">
            <button
              onClick={() => {
                onProfileClick();
                setIsUserMenuOpen(false);
                closeSidebar();
              }}
              className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-sky-600"
            >
              <UserIcon /> <span className="ml-2">Profile</span>
            </button>
            <div className="border-t border-gray-600 my-1"></div>
            <button
              onClick={() => {
                switchActiveBand(null);
                setIsUserMenuOpen(false);
                closeSidebar();
              }}
              className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-sky-600"
            >
              <SwitchBandIcon /> <span className="ml-2">Switch Band</span>
            </button>
            <button
              onClick={() => {
                handleSignOut();
                closeSidebar();
              }}
              className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-sky-600"
            >
              <SignOutIcon /> <span className="ml-2">Sign Out</span>
            </button>
          </div>
        )}
        <button
          onClick={() => setIsUserMenuOpen((prev) => !prev)}
          className="flex items-center w-full text-left p-3 rounded-md transition-colors text-gray-300 hover:bg-gray-700"
        >
          <UserIcon />
          <span className="ml-3">Profile</span>
        </button>
      </div>
    </aside>
  );
}

export default AppSidebar;
