import type { Persona } from '@/lib/types';

interface PersonaBadgeProps {
  persona: Persona;
  size?: 'sm' | 'md';
}

export function PersonaBadge({ persona, size = 'sm' }: PersonaBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${
        size === 'sm'
          ? 'px-2 py-0.5 text-xs'
          : 'px-3 py-1 text-sm'
      }`}
      style={{
        backgroundColor: `${persona.color}20`,
        color: persona.color,
        borderColor: `${persona.color}40`,
        borderWidth: 1,
        borderStyle: 'solid',
      }}
      title={persona.description}
    >
      {persona.icon} {persona.nameLocalized}
    </span>
  );
}
