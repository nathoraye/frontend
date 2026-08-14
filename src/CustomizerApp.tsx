import { SidebarControls } from './components/ui/SidebarControls';
import { BottomBar } from './components/ui/BottomBar';
import { Scene } from './components/canvas/Scene';
import { FabricEditor } from './components/canvas/FabricEditor';

/** Standalone shell for the 3D customizer module: 2D Fabric editor + 3D viewer, split screen. */
export function CustomizerApp() {
  return (
    <div className="h-screen w-screen flex bg-neutral-100 text-neutral-800">
      <SidebarControls />
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-neutral-200">
            <FabricEditor />
          </div>
          <div className="w-1/2">
            <Scene />
          </div>
        </div>
        <BottomBar />
      </div>
    </div>
  );
}

export default CustomizerApp;
