import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import LeadDetail from './LeadDetail';

export default function SdrLeadPage() {
  const { leadLaunchId = '' } = useParams();
  const { isAdmin } = useAuth();
  return (
    <div className="fade-in">
      <LeadDetail leadLaunchId={leadLaunchId} mode={isAdmin ? 'admin' : 'sdr'} back={{ to: '/sdr', label: 'Mis leads' }} />
    </div>
  );
}
