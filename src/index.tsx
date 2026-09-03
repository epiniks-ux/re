import { definePlugin, routerHook } from "@decky/ui";
import { FaTrophy } from "react-icons/fa";
import { SettingsPanel } from "./components/SettingsPanel";
import { NotificationManager } from "./components/NotificationManager";

const GLOBAL_COMPONENT_NAME = "achievement-notifier-overlay";

export default definePlugin(() => {
  routerHook.addGlobalComponent(GLOBAL_COMPONENT_NAME, NotificationManager);

  return {
    name: "Achievement Notifier",
    titleView: <div>Achievement Notifier</div>,
    content: <SettingsPanel />,
    icon: <FaTrophy />,
    onDismount() {
      routerHook.removeGlobalComponent(GLOBAL_COMPONENT_NAME);
    },
  };
});
