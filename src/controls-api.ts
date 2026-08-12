import { getEraForDate } from "./calendar";
import type TtrpgToolsTimePlugin from "./main";

export const TTRPG_TOOLS_TIME_CONTROLS_API_VERSION = 1;

export interface TtrpgToolsControlsProviderAction {
  id: string;
  name: string;
  icon: string;
  group: string;
  description?: string;
  available: boolean;
}

export interface TtrpgToolsTimeControlsApi {
  apiVersion: typeof TTRPG_TOOLS_TIME_CONTROLS_API_VERSION;
  providerId: "ttrpg-tools-time";
  providerName: "TTRPG Tools - Time";
  getActions(): TtrpgToolsControlsProviderAction[];
  executeAction(actionId: string): Promise<void>;
}

interface TimeControlActionDefinition {
  id: string;
  name: string;
  icon: string;
  group: string;
  description?: string;
  isAvailable: () => boolean;
  execute: () => Promise<void>;
}

 /**
 * Public, version‑based interface for TTRPG Tools – Controls.
 *
 * Other plugins should exclusively use this API and must not directly
 * access internal views, modals, or plugin fields.
 */

export function createTimeControlsApi(
  plugin: TtrpgToolsTimePlugin
): TtrpgToolsTimeControlsApi {
  const getDefinitions = (): TimeControlActionDefinition[] => [
    {
      id: "calendar.open",
      name: "Open calendar",
      icon: "calendar",
      group: "Navigation",
      description: "Open the calendar sidebar.",
      isAvailable: () => true,
      execute: async () => {
        await plugin.activateView();
      }
    },
    {
      id: "day.open",
      name: "Open day view",
      icon: "sun",
      group: "Navigation",
      description: "Open the day view.",
      isAvailable: () => true,
      execute: async () => {
        await plugin.activateDayView();
      }
    },
    {
      id: "calendar.jump-to-today",
      name: "Jump to today",
      icon: "crosshair",
      group: "Navigation",
      description: "Moves to the configured current calendar day.",
      isAvailable: () => plugin.activeCalendar !== null,
      execute: async () => {
        await plugin.jumpToToday();
      }
    },
    {
      id: "timeline.open",
      name: "Open timeline",
      icon: "milestone",
      group: "Timeline",
      description: "Open the standalone timeline view.",
      isAvailable: () => true,
      execute: async () => {
        await plugin.activateTimelineView();
      }
    },
    {
      id: "timeline.filters.open",
      name: "Open timeline filters",
      icon: "tags",
      group: "Timeline",
      description: "Open the sidebar for timeline tag filters.",
      isAvailable: () => true,
      execute: async () => {
        await plugin.activateTimelineFilterView();
      }
    },
    {
      id: "timeline.insert",
      name: "Insert timeline",
      icon: "list-plus",
      group: "Timeline",
      description: "Insert a timeline code block into the active Markdown note.",
      isAvailable: () => true,
      execute: async () => {
        plugin.openTimelineInsertModal();
      }
    },
    {
      id: "event.create",
      name: "Create event",
      icon: "plus-circle",
      group: "Events",
      description: "Open the event editor.",
      isAvailable: () => plugin.activeCalendar !== null,
      execute: async () => {
        await plugin.activateEventEditorView();
      }
    },
    {
      id: "event.explorer",
      name: "Open event explorer",
      icon: "search",
      group: "Events",
      description: "Browse and manage events in the active calendar.",
      isAvailable: () => plugin.activeCalendar !== null,
      execute: async () => {
        plugin.openEventExplorerModal();
      }
    },
    {
      id: "weather.apply-ranges",
      name: "Wetterbereiche anwenden",
      icon: "cloud-drizzle",
      group: "Weather",
      description: "Apply weather packs to one or more date ranges.",
      isAvailable: () =>
        plugin.activeCalendar !== null &&
        plugin.activeCalendar.weatherEnabled,
      execute: async () => {
        plugin.openWeatherRangeBatchModal();
      }
    },
    {
      id: "weather.manage",
      name: "Manage weather packs",
      icon: "cloud",
      group: "Weather",
      description: "Open weather pack management.",
      isAvailable: () => true,
      execute: async () => {
        plugin.openManageWeatherPacksModal();
      }
    },
    {
      id: "frontmatter.manage",
      name: "Manage frontmatter",
      icon: "hammer",
      group: "Frontmatter",
      description: "Configure frontmatter import and export mappings.",
      isAvailable: () => true,
      execute: async () => {
        plugin.openFrontmatterManagerModal();
      }
    },
    {
      id: "frontmatter.scan-active-note",
      name: "Scan active note",
      icon: "scan",
      group: "Frontmatter",
      description: "Import event data from the active Markdown note frontmatter.",
      isAvailable: () => plugin.activeCalendar !== null,
      execute: async () => {
        await plugin.scanActiveNoteFrontmatter();
      }
    },
    {
      id: "frontmatter.scan-vault",
      name: "Scan vault frontmatter",
      icon: "folder-search",
      group: "Frontmatter",
      description: "Import event data from all Markdown notes in the vault.",
      isAvailable: () => plugin.activeCalendar !== null,
      execute: async () => {
        await plugin.scanVaultFrontmatter();
      }
    },
    {
      id: "tag-packs.manage",
      name: "Manage tag packs",
      icon: "code",
      group: "Management",
      description: "Open tag pack management.",
      isAvailable: () => true,
      execute: async () => {
        plugin.openManageTagPacksModal();
      }
    },
    {
      id: "calendar.edit",
      name: "Edit calendar",
      icon: "pencil",
      group: "Management",
      description: "Open the active calendar editor.",
      isAvailable: () => plugin.activeCalendar !== null,
      execute: async () => {
        plugin.openEditActiveCalendarModal();
      }
    },
    {
      id: "era.toggle-description",
      name: "Toggle era description",
      icon: "scroll-text",
      group: "Management",
      description: "Show or hide the active era description in the calendar view.",
      isAvailable: () => {
        const calendar = plugin.activeCalendar;

        return Boolean(
          calendar &&
          getEraForDate(
            calendar.definition,
            calendar.state.cursorDate
          )?.description?.trim()
        );
      },
      execute: async () => {
        await plugin.toggleActiveEraDescription();
      }
    },
    {
      id: "plugin.settings",
      name: "Open Time settings",
      icon: "settings",
      group: "Management",
      description: "Open the TTRPG Tools - Time settings.",
      isAvailable: () => true,
      execute: async () => {
        plugin.openPluginSettings();
      }
    },
    ...plugin.getConfiguredTimeAdvanceButtons().map(
      (button): TimeControlActionDefinition => ({
        id: `fantasy-time.${button.id}`,
        name: button.label,
        icon: button.icon?.trim() || "timer",
        group: "Fantasy time",
        description: `Advance fantasy time by ${button.hours} hours and ${button.minutes} minutes.`,
        isAvailable: () =>
          plugin.activeCalendar !== null &&
          plugin.activeCalendar.definition.time.enabled,
        execute: async () => {
          await plugin.advanceFantasyClock(button.hours, button.minutes);
        }
      })
    )
  ];

  return {
    apiVersion: TTRPG_TOOLS_TIME_CONTROLS_API_VERSION,
    providerId: "ttrpg-tools-time",
    providerName: "TTRPG Tools - Time",
    getActions: () =>
      getDefinitions().map((action) => ({
        id: action.id,
        name: action.name,
        icon: action.icon,
        group: action.group,
        description: action.description,
        available: action.isAvailable()
      })),
    executeAction: async (actionId: string) => {
      const action = getDefinitions().find(
        (candidate) => candidate.id === actionId
      );

      if (!action || !action.isAvailable()) {
        return;
      }

      await action.execute();
    }
  };
}