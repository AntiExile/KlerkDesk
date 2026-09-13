import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';

interface DashboardProps {
  onOpenSettings: () => void;
}

export function Dashboard({ onOpenSettings }: DashboardProps) {
  return (
    <div className="flex h-full w-full bg-surface-primary">
      <Sidebar onOpenSettings={onOpenSettings} />
      <ChatArea />
    </div>
  );
}
