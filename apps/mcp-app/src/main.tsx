import { createRoot } from 'react-dom/client';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(<p className="p-4 text-sm">passwerk workbench {__WORKBENCH_VERSION__}</p>);
