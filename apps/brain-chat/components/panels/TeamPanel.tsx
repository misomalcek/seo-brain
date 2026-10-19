'use client';

import { useState, useEffect } from 'react';
import { getPresence } from '@/lib/api';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isOnline: boolean;
  lastActive?: string;
}

interface TeamPanelProps {
  onStartDM?: (userId: string) => void;
}

export function TeamPanel({ onStartDM }: TeamPanelProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPresence()
      .then(data => {
        setMembers((data.users || []).map((u: any) => ({
          id: u.id, name: u.name, email: u.email, role: u.role,
          isOnline: u.isOnline || u.is_online, lastActive: u.lastActive || u.last_active,
        })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const online = members.filter(m => m.isOnline);
  const offline = members.filter(m => !m.isOnline);

  return (
    <div className="flex flex-col h-full min-h-0 px-4 py-3">
      <div className="text-xs text-muted-foreground mb-3">
        {online.length} online · {offline.length} offline
      </div>

      {loading ? (
        <div className="text-center py-8 text-sm text-muted-foreground">Načítavam...</div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-1">
          {[...online, ...offline].map(member => {
            const handleOpen = () => onStartDM?.(member.id);
            const clickable = !!onStartDM;
            return (
              <div
                key={member.id}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? handleOpen : undefined}
                onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(); } } : undefined}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${clickable ? 'hover:bg-surface-hover cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40' : ''}`}
                title={clickable ? `Otvoriť chat s ${member.name}` : undefined}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${member.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{member.name}</div>
                  <div className="text-[11px] text-muted-foreground">{member.role}</div>
                </div>
                {clickable && (
                  <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
