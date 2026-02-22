import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Trash2,
  Image,
  Film,
  Loader2,
  X,
  Clock,
  ChevronRight,
} from 'lucide-react';

function formatTimeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function HistorySidebar({
  isOpen,
  onClose,
  items,
  loading,
  onSelect,
  onDelete,
  onRefresh,
  selectedId,
}) {
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (id, e) => {
    setDeletingId(id);
    await onDelete(id, e);
    setDeletingId(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          initial={{ x: -320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -320, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="history-sidebar fixed left-0 top-0 bottom-0 w-80 z-50 flex flex-col bg-gray-900/95 backdrop-blur-xl border-r border-white/10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-semibold text-white">History</h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onRefresh}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Refresh"
              >
                <Clock className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="Close sidebar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <History className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No generations yet</p>
                <p className="text-xs mt-1">Your creations will appear here</p>
              </div>
            ) : (
              <ul className="py-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => onSelect(item)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors group ${
                        selectedId === item.id ? 'bg-violet-500/10 border-l-2 border-violet-500' : 'border-l-2 border-transparent'
                      }`}
                    >
                      {/* Thumbnail / Icon */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
                        {item.result?.mediaUrl ? (
                          item.type === 'image' ? (
                            <img
                              src={item.result.mediaUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : (
                            <Film className="w-5 h-5 text-blue-400" />
                          )
                        ) : item.type === 'video' ? (
                          <Film className="w-5 h-5 text-blue-400" />
                        ) : (
                          <Image className="w-5 h-5 text-violet-400" />
                        )}
                        {/* Fallback icon for broken images */}
                        <div className="hidden items-center justify-center w-full h-full">
                          <Image className="w-5 h-5 text-violet-400" />
                        </div>
                      </div>

                      {/* Text content */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate leading-tight">
                          {item.prompt || 'Untitled'}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            item.type === 'video'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-violet-500/20 text-violet-300'
                          }`}>
                            {item.type === 'video' ? 'Video' : 'Image'}
                          </span>
                          <span className="text-[10px] text-gray-500">
                            {formatTimeAgo(item.createdAt)}
                          </span>
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        className="flex-shrink-0 p-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/10 text-center">
            <p className="text-[10px] text-gray-500">
              {items.length} generation{items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
