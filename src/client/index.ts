import { PluginSlot } from "@sharkord/plugin-sdk";
import type {
  TPluginComponentsMapBySlotId,
  TPluginMessageComponentsMap,
  TPluginTabs,
} from "@sharkord/plugin-sdk/client";
import { AdminTab, ShareCard, ShareSlot } from "./ui";

const components: TPluginComponentsMapBySlotId = {
  [PluginSlot.CHAT_ACTIONS]: [ShareSlot],
};

const messageComponents: TPluginMessageComponentsMap = {
  share: ShareCard,
};

const tabs: TPluginTabs = [{ id: "shares", label: "Shared files", component: AdminTab }];

export { components, messageComponents, tabs };
