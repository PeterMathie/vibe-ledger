import { usePreventScreenCapture } from 'expo-screen-capture';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type GestureResponderEvent,
} from 'react-native';

import {
  asyncStateLabel,
  heatMapDayLabel,
  visibleHeatMapCue,
} from './src/app/accessibility';
import {
  formatLocalDataChange,
  getMonzoConnectionSummary,
  parseRestoreText,
  serializePortableExport,
  type MonzoConnectionSummary,
} from './src/app/settings';
import {
  createRunoverModel,
  DEFAULT_ALLOCATION,
  parseAllocationPercentages,
  ratiosFromBoundaries,
  runoverRow,
} from './src/app/allocation';
import { createMonthlyHeatMap, type MonthlyHeatMap } from './src/app/heat-map';
import { createMoneyMapModel, type MoneyMapMode } from './src/app/money-map';
import type { ExplorerFilter } from './src/app/view-models';
import {
  createExplorerViewModel,
  createHomeViewModel,
} from './src/app/view-models';
import {
  createTrendChartLayout,
  periodRequest,
  type TrendPeriod,
} from './src/app/trends';
import { initializeApplication } from './src/app/startup';
import type { Database } from './src/data/database';
import {
  importDemoData,
  loadLedgerSnapshot,
  queryLedgerTransactions,
  queryLedgerTrends,
  resetDemoData,
  updateMonthlyAllocation,
  type LedgerQueryResult,
  type LedgerSnapshot,
  type TrendQueryResult,
} from './src/data/demo-repository';
import {
  exportLocalData,
  getLocalReadiness,
  PORTABLE_EXPORT_WARNING,
  restoreLocalData,
  wipeLocalData,
  type LocalReadiness,
} from './src/data/local-data';
import {
  createMerchantRule,
  listCategories,
  listMerchantRules,
  saveTransactionCorrection,
  setMerchantRuleEnabled,
  undoLatestClassificationChange,
  updateMerchantRule,
} from './src/data/classification-repository';
import {
  confirmSubscriptionSuggestion,
  denySubscriptionSuggestion,
  detectSubscriptionSuggestions,
  disableSubscription,
  listSubscriptions,
  saveSubscriptionDetails,
  summarizeSubscriptions,
  type SubscriptionRecord,
  type SubscriptionSuggestion,
} from './src/data/subscription-repository';
import {
  createMonthlyBudget,
  type AllocationRatios,
} from './src/domain/budget';
import {
  BUDGET_SCOPES,
  EVENT_TYPES,
  SUPER_CATEGORY_KEYS,
  type BudgetScope,
  type EventType,
  type SuperCategoryKey,
} from './src/domain/enums';
import {
  allocateByBasisPoints,
  formatMoney,
  money,
  parseDecimalMoney,
} from './src/domain/money';
import {
  dayQuery,
  monthQuery,
  type AmountComparator,
  type LedgerQuery,
} from './src/domain/query';
import {
  enumerateMonths,
  type TrendBar,
  type TrendModel,
  type TrendRequest,
  type TrendSelection,
} from './src/domain/trends';
import {
  parseLedgerSearch,
  type ParsedLedgerSearch,
} from './src/domain/search-parser';
import type {
  Category,
  ClassificationRule,
  ClassifiedTransaction,
  RenewalIntent,
} from './src/domain/types';
import { MockMonzoApi } from './src/integrations/monzo/mock';
import { ExpoSecureTokenStore } from './src/integrations/monzo/secure-store';
import { syncMonzo, wipeMonzoConnection } from './src/integrations/monzo/sync';

type LoadState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'EMPTY' }
  | { readonly status: 'ERROR' }
  | { readonly status: 'READY'; readonly snapshot: LedgerSnapshot };

type Screen =
  | { readonly name: 'HOME' }
  | { readonly name: 'TRENDS' }
  | { readonly name: 'SUBSCRIPTIONS' }
  | { readonly name: 'SETTINGS' }
  | { readonly name: 'MONEY_MAP' }
  | {
      readonly name: 'EXPLORER';
      readonly filter: ExplorerFilter;
      readonly currency: string;
      readonly unrecognizedTokens: readonly string[];
      readonly returnTo:
        'HOME' | 'TRENDS' | 'SUBSCRIPTIONS' | 'MONEY_MAP' | 'SETTINGS';
    };

type QueryLoadState =
  | { readonly status: 'IDLE' | 'LOADING' | 'ERROR' }
  | { readonly status: 'READY'; readonly result: LedgerQueryResult };

interface Palette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceMuted: string;
  readonly text: string;
  readonly muted: string;
  readonly border: string;
  readonly accent: string;
  readonly accentText: string;
  readonly breach: string;
  readonly living: string;
  readonly saving: string;
  readonly fun: string;
  readonly warning: string;
}

const LIGHT: Palette = {
  background: '#f4f2ed',
  surface: '#ffffff',
  surfaceMuted: '#ece9e1',
  text: '#17201d',
  muted: '#59645f',
  border: '#d5d9d5',
  accent: '#176b56',
  accentText: '#ffffff',
  breach: '#b42318',
  living: '#2869c7',
  saving: '#6f4ac6',
  fun: '#16865f',
  warning: '#946200',
};

const DARK: Palette = {
  background: '#0b0f15',
  surface: '#131a24',
  surfaceMuted: '#192231',
  text: '#f3f6f8',
  muted: '#9ca9b8',
  border: '#2b3543',
  accent: '#a9c6ff',
  accentText: '#0b0f15',
  breach: '#ff6868',
  living: '#6fa8ff',
  saving: '#a886ff',
  fun: '#56d3ae',
  warning: '#efb35d',
};

const DEMO_MODE_ENABLED = process.env.EXPO_PUBLIC_DEMO_MODE !== 'false';

function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setReducedMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

export default function App() {
  usePreventScreenCapture('vibe-ledger-financial-screens');
  const palette = useColorScheme() === 'dark' ? DARK : LIGHT;
  const [database, setDatabase] = useState<Database | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'LOADING' });
  const [screen, setScreen] = useState<Screen>({ name: 'HOME' });
  const [queryState, setQueryState] = useState<QueryLoadState>({
    status: 'IDLE',
  });
  const [busyAction, setBusyAction] = useState<'LOAD' | 'RESET' | null>(null);

  const retryInitialize = useCallback(async () => {
    setLoadState({ status: 'LOADING' });
    try {
      const readyDatabase = await initializeApplication();
      setDatabase(readyDatabase);
      const snapshot = await loadLedgerSnapshot(readyDatabase);
      setLoadState(toLoadState(snapshot));
    } catch {
      setLoadState({ status: 'ERROR' });
    }
  }, []);

  const refresh = useCallback(
    async (nextDatabase: Database, requestedMonth?: string) => {
      const snapshot = await loadLedgerSnapshot(nextDatabase, requestedMonth);
      setLoadState(toLoadState(snapshot));
    },
    [],
  );

  useEffect(() => {
    let active = true;
    initializeApplication().then(
      async (readyDatabase) => {
        if (!active) {
          return;
        }
        setDatabase(readyDatabase);
        try {
          const snapshot = await loadLedgerSnapshot(readyDatabase);
          if (active) {
            setLoadState(toLoadState(snapshot));
          }
        } catch {
          if (active) {
            setLoadState({ status: 'ERROR' });
          }
        }
      },
      () => {
        if (active) {
          setLoadState({ status: 'ERROR' });
        }
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const loadDemo = useCallback(async () => {
    if (database === null) {
      return;
    }
    setBusyAction('LOAD');
    try {
      await importDemoData(database);
      await refresh(database, '2026-09');
      setScreen({ name: 'HOME' });
    } catch {
      setLoadState({ status: 'ERROR' });
    } finally {
      setBusyAction(null);
    }
  }, [database, refresh]);

  const resetDemo = useCallback(() => {
    if (database === null) {
      return;
    }
    Alert.alert(
      'Reset Demo Data?',
      'Only records owned by the synthetic demo dataset will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Demo Data',
          style: 'destructive',
          onPress: () => {
            setBusyAction('RESET');
            resetDemoData(database)
              .then(() => refresh(database))
              .then(() => setScreen({ name: 'HOME' }))
              .catch(() => setLoadState({ status: 'ERROR' }))
              .finally(() => setBusyAction(null));
          },
        },
      ],
    );
  }, [database, refresh]);

  const selectMonth = useCallback(
    (month: string) => {
      if (database === null) {
        return;
      }
      setLoadState({ status: 'LOADING' });
      refresh(database, month).catch(() => setLoadState({ status: 'ERROR' }));
    },
    [database, refresh],
  );

  const openExplorer = useCallback(
    async (
      filter: ExplorerFilter,
      currency: string,
      unrecognizedTokens: readonly string[] = [],
      returnTo:
        'HOME' | 'TRENDS' | 'SUBSCRIPTIONS' | 'MONEY_MAP' | 'SETTINGS' = 'HOME',
    ) => {
      if (database === null) {
        return;
      }
      setScreen({
        name: 'EXPLORER',
        filter,
        currency,
        unrecognizedTokens,
        returnTo,
      });
      setQueryState({ status: 'LOADING' });
      try {
        setQueryState({
          status: 'READY',
          result: await queryLedgerTransactions(database, filter, currency),
        });
      } catch {
        setQueryState({ status: 'ERROR' });
      }
    },
    [database],
  );

  const updateAllocation = useCallback(
    async (
      monthKey: string,
      currency: string,
      budgetBaseMinor: number,
      ratios: AllocationRatios,
    ) => {
      if (database === null) {
        return;
      }
      await updateMonthlyAllocation(
        database,
        monthKey,
        currency,
        budgetBaseMinor,
        ratios,
        '2026-09-24T12:00:00.000Z',
      );
      await refresh(database, monthKey);
    },
    [database, refresh],
  );

  const refreshAfterCorrection = useCallback(
    async (
      filter: ExplorerFilter,
      currency: string,
      month: string,
      returnTo: 'HOME' | 'TRENDS' | 'SUBSCRIPTIONS' | 'MONEY_MAP' | 'SETTINGS',
    ) => {
      if (database === null) {
        return;
      }
      await refresh(database, month);
      await openExplorer(filter, currency, [], returnTo);
    },
    [database, openExplorer, refresh],
  );

  if (loadState.status === 'LOADING') {
    return (
      <StateScreen
        palette={palette}
        title="Preparing local ledger"
        body="Loading the app-private SQLite database."
        loading
      />
    );
  }

  if (loadState.status === 'ERROR') {
    return (
      <StateScreen
        palette={palette}
        title="Local ledger unavailable"
        body="The local database could not be prepared. Try again without leaving the app."
        onRetry={() => void retryInitialize()}
      />
    );
  }

  if (database === null) {
    return (
      <StateScreen
        palette={palette}
        title="Local ledger unavailable"
        body="The local database could not be prepared. Try again without leaving the app."
        onRetry={() => void retryInitialize()}
      />
    );
  }

  if (loadState.status === 'EMPTY') {
    if (screen.name === 'SETTINGS') {
      return (
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <SettingsScreen
            database={database}
            onDataChanged={async () => {
              await refresh(database);
              setScreen({ name: 'HOME' });
            }}
            onHome={() => setScreen({ name: 'HOME' })}
            onOpenBreakdown={() => setScreen({ name: 'HOME' })}
            onOpenSubscriptions={() => setScreen({ name: 'HOME' })}
            onOpenTrends={() => setScreen({ name: 'HOME' })}
            palette={palette}
          />
          <StatusBar style={palette === DARK ? 'light' : 'dark'} />
        </SafeAreaView>
      );
    }
    return (
      <DemoEmptyState
        demoAvailable={DEMO_MODE_ENABLED}
        palette={palette}
        loading={busyAction === 'LOAD'}
        onLoad={loadDemo}
        onSettings={() => setScreen({ name: 'SETTINGS' })}
      />
    );
  }

  const { snapshot } = loadState;
  if (snapshot.ledgerMonth === null) {
    return (
      <DemoEmptyState
        demoAvailable={DEMO_MODE_ENABLED}
        palette={palette}
        loading={busyAction === 'LOAD'}
        onLoad={loadDemo}
        onSettings={() => setScreen({ name: 'SETTINGS' })}
      />
    );
  }

  const { budget, summary, transactions } = snapshot.ledgerMonth;
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      <StatusBar style={palette === DARK ? 'light' : 'dark'} />
      {screen.name === 'HOME' ? (
        <HomeScreen
          key={`${budget.monthKey}:${budget.updatedAt}`}
          palette={palette}
          budget={budget}
          summary={summary}
          transactions={transactions}
          months={snapshot.months}
          activeMonth={snapshot.activeMonth ?? budget.monthKey}
          busy={busyAction !== null}
          onSelectMonth={selectMonth}
          onExplore={(filter) => openExplorer(filter, budget.currency)}
          onOpenTrends={() => setScreen({ name: 'TRENDS' })}
          onOpenSubscriptions={() => setScreen({ name: 'SUBSCRIPTIONS' })}
          onOpenSettings={() => setScreen({ name: 'SETTINGS' })}
          onOpenMoneyMap={() => setScreen({ name: 'MONEY_MAP' })}
          onUpdateAllocation={updateAllocation}
          onReset={resetDemo}
        />
      ) : screen.name === 'TRENDS' ? (
        <TrendsScreen
          activeMonth={snapshot.activeMonth ?? budget.monthKey}
          currency={budget.currency}
          database={database}
          onExplore={(filter) =>
            openExplorer(filter, budget.currency, [], 'TRENDS')
          }
          onHome={() => setScreen({ name: 'HOME' })}
          onOpenSubscriptions={() => setScreen({ name: 'SUBSCRIPTIONS' })}
          onOpenSettings={() => setScreen({ name: 'SETTINGS' })}
          palette={palette}
        />
      ) : screen.name === 'SUBSCRIPTIONS' ? (
        <SubscriptionsScreen
          database={database}
          onExplore={(subscriptionId, currency) =>
            openExplorer(
              {
                date: {
                  kind: 'RANGE',
                  startDate: '1900-01-01',
                  endDate: '2100-12-31',
                },
                subscriptionId,
              },
              currency,
              [],
              'SUBSCRIPTIONS',
            )
          }
          onHome={() => setScreen({ name: 'HOME' })}
          onOpenTrends={() => setScreen({ name: 'TRENDS' })}
          onOpenSettings={() => setScreen({ name: 'SETTINGS' })}
          onOpenBreakdown={() =>
            openExplorer(monthQuery(budget.monthKey), budget.currency)
          }
          palette={palette}
        />
      ) : screen.name === 'MONEY_MAP' ? (
        <MoneyMapScreen
          budget={budget}
          transactions={transactions}
          resolutionTransactions={snapshot.ledgerMonth.resolutionTransactions}
          months={snapshot.months}
          activeMonth={snapshot.activeMonth ?? budget.monthKey}
          otherCurrencies={snapshot.currencies.filter(
            (currency) => currency !== budget.currency,
          )}
          onSelectMonth={selectMonth}
          onExplore={(filter) =>
            openExplorer(filter, budget.currency, [], 'MONEY_MAP')
          }
          onHome={() => setScreen({ name: 'HOME' })}
          onOpenTrends={() => setScreen({ name: 'TRENDS' })}
          onOpenSubscriptions={() => setScreen({ name: 'SUBSCRIPTIONS' })}
          onOpenSettings={() => setScreen({ name: 'SETTINGS' })}
          palette={palette}
        />
      ) : screen.name === 'SETTINGS' ? (
        <SettingsScreen
          database={database}
          onDataChanged={() => refresh(database, budget.monthKey)}
          onHome={() => setScreen({ name: 'HOME' })}
          onOpenBreakdown={() =>
            openExplorer(
              monthQuery(budget.monthKey),
              budget.currency,
              [],
              'SETTINGS',
            )
          }
          onOpenSubscriptions={() => setScreen({ name: 'SUBSCRIPTIONS' })}
          onOpenTrends={() => setScreen({ name: 'TRENDS' })}
          palette={palette}
        />
      ) : queryState.status === 'READY' ? (
        <ExplorerScreen
          backDestination={screen.returnTo}
          database={database}
          palette={palette}
          filter={screen.filter}
          currency={screen.currency}
          queryResult={queryState.result}
          unrecognizedTokens={screen.unrecognizedTokens}
          onChangeFilter={(nextFilter) =>
            openExplorer(nextFilter, screen.currency, [], screen.returnTo)
          }
          onSearch={(parsed) =>
            openExplorer(
              parsed.query,
              screen.currency,
              parsed.unrecognizedTokens,
              screen.returnTo,
            )
          }
          onDataChanged={() =>
            refreshAfterCorrection(
              screen.filter,
              screen.currency,
              budget.monthKey,
              screen.returnTo,
            )
          }
          onOpenTrends={() => setScreen({ name: 'TRENDS' })}
          onOpenSubscriptions={() => setScreen({ name: 'SUBSCRIPTIONS' })}
          onOpenSettings={() => setScreen({ name: 'SETTINGS' })}
          onBack={() => {
            setScreen(
              screen.returnTo === 'TRENDS'
                ? { name: 'TRENDS' }
                : screen.returnTo === 'SUBSCRIPTIONS'
                  ? { name: 'SUBSCRIPTIONS' }
                  : screen.returnTo === 'MONEY_MAP'
                    ? { name: 'MONEY_MAP' }
                    : screen.returnTo === 'SETTINGS'
                      ? { name: 'SETTINGS' }
                      : { name: 'HOME' },
            );
            setQueryState({ status: 'IDLE' });
          }}
        />
      ) : (
        <QueryStateScreen
          palette={palette}
          status={queryState.status}
          onRetry={() =>
            openExplorer(
              screen.filter,
              screen.currency,
              screen.unrecognizedTokens,
              screen.returnTo,
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

function DemoEmptyState({
  demoAvailable,
  palette,
  loading,
  onLoad,
  onSettings,
}: {
  readonly demoAvailable: boolean;
  readonly palette: Palette;
  readonly loading: boolean;
  readonly onLoad: () => void;
  readonly onSettings: () => void;
}) {
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      <View style={styles.centered}>
        <Text style={[styles.demoPill, { color: palette.accent }]}>
          {demoAvailable ? 'LOCAL DEMO DATA' : 'LOCAL LEDGER'}
        </Text>
        <Text style={[styles.heroTitle, { color: palette.text }]}>
          {demoAvailable
            ? 'Explore the money model safely'
            : 'Your local ledger is empty'}
        </Text>
        <Text style={[styles.heroBody, { color: palette.muted }]}>
          {demoAvailable
            ? 'Load deterministic synthetic transactions into this device only. No Monzo connection, network request, account, or credential is used.'
            : 'Restore a Vibe Ledger export from Settings. This production build contains no synthetic transaction history.'}
        </Text>
        {demoAvailable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Load synthetic Demo Data"
            accessibilityState={{ busy: loading, disabled: loading }}
            disabled={loading}
            onPress={onLoad}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 },
            ]}
            testID="demo-load"
          >
            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Loading synthetic Demo Data"
                color={palette.accentText}
              />
            ) : (
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: palette.accentText },
                ]}
              >
                Load Demo Data
              </Text>
            )}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Settings and local data restore"
          onPress={onSettings}
          style={styles.secondaryButton}
        >
          <Text style={[styles.smallButtonText, { color: palette.accent }]}>
            Settings and restore
          </Text>
        </Pressable>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          {demoAvailable
            ? 'Import is idempotent. Reset removes only demo-owned records.'
            : 'All analytics remain offline and local to this device.'}
        </Text>
      </View>
      <StatusBar style={palette === DARK ? 'light' : 'dark'} />
    </SafeAreaView>
  );
}

function HomeScreen({
  palette,
  budget,
  summary,
  transactions,
  months,
  activeMonth,
  busy,
  onSelectMonth,
  onExplore,
  onOpenTrends,
  onOpenSubscriptions,
  onOpenSettings,
  onOpenMoneyMap,
  onUpdateAllocation,
  onReset,
}: {
  readonly palette: Palette;
  readonly budget: NonNullable<LedgerSnapshot['ledgerMonth']>['budget'];
  readonly summary: NonNullable<LedgerSnapshot['ledgerMonth']>['summary'];
  readonly transactions: NonNullable<
    LedgerSnapshot['ledgerMonth']
  >['transactions'];
  readonly months: readonly string[];
  readonly activeMonth: string;
  readonly busy: boolean;
  readonly onSelectMonth: (month: string) => void;
  readonly onExplore: (filter: ExplorerFilter) => void;
  readonly onOpenTrends: () => void;
  readonly onOpenSubscriptions: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenMoneyMap: () => void;
  readonly onUpdateAllocation: (
    monthKey: string,
    currency: string,
    budgetBaseMinor: number,
    ratios: AllocationRatios,
  ) => Promise<void>;
  readonly onReset: () => void;
}) {
  const storedRatios = useMemo(
    () => ({
      LIVING: budget.livingRatioBp,
      SAVING: budget.savingRatioBp,
      FUN: budget.funRatioBp,
    }),
    [budget.funRatioBp, budget.livingRatioBp, budget.savingRatioBp],
  );
  const [draftRatios, setDraftRatios] =
    useState<AllocationRatios>(storedRatios);
  const [allocationEditorOpen, setAllocationEditorOpen] = useState(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const previewBudget = useMemo(
    () =>
      createMonthlyBudget(
        budget.monthKey,
        budget.currency,
        budget.budgetBaseMinor,
        draftRatios,
        budget.updatedAt,
      ),
    [budget, draftRatios],
  );
  const viewModel = useMemo(
    () => createHomeViewModel(previewBudget, summary, transactions),
    [previewBudget, summary, transactions],
  );
  const heatMap = useMemo(
    () =>
      createMonthlyHeatMap(
        budget.monthKey,
        previewBudget.livingTargetMinor,
        previewBudget.funTargetMinor,
        summary.dailyIncludedSpendMinor,
      ),
    [
      budget.monthKey,
      previewBudget.funTargetMinor,
      previewBudget.livingTargetMinor,
      summary.dailyIncludedSpendMinor,
    ],
  );
  const allocationEditable = budget.closedAt === null;
  const commitAllocation = useCallback(
    async (ratios: AllocationRatios) => {
      setDraftRatios(ratios);
      setAllocationError(null);
      try {
        await onUpdateAllocation(
          budget.monthKey,
          budget.currency,
          budget.budgetBaseMinor,
          ratios,
        );
        return true;
      } catch {
        setDraftRatios(storedRatios);
        setAllocationError(
          'The allocation could not be saved to this local month.',
        );
        return false;
      }
    },
    [budget, onUpdateAllocation, storedRatios],
  );
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      onScroll={({ nativeEvent }) =>
        setScrollOffset(nativeEvent.contentOffset.y)
      }
      scrollEventThrottle={32}
      testID="home-screen"
    >
      <View style={styles.topRow}>
        <View>
          <Text style={[styles.demoPill, { color: palette.accent }]}>
            LOCAL · SYNTHETIC DEMO
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.screenTitle, { color: palette.text }]}
          >
            {viewModel.monthLabel}
          </Text>
        </View>
      </View>

      <View style={styles.monthActionRow}>
        <View style={styles.monthRow}>
          {months.map((month) => (
            <Pressable
              key={month}
              accessibilityRole="button"
              accessibilityLabel={`Show ${formatTrendMonth(month)}`}
              accessibilityState={{ selected: month === activeMonth }}
              onPress={() => onSelectMonth(month)}
              style={[
                styles.monthButton,
                {
                  backgroundColor:
                    month === activeMonth
                      ? palette.accent
                      : palette.surfaceMuted,
                },
              ]}
              testID={`month-${month}`}
            >
              <Text
                style={{
                  color:
                    month === activeMonth ? palette.accentText : palette.text,
                  fontWeight: '700',
                }}
              >
                {month}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset synthetic Demo Data"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onReset}
          style={styles.textButton}
          testID="demo-reset"
        >
          <Text style={[styles.textButtonLabel, { color: palette.muted }]}>
            Reset Demo
          </Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionKicker, { color: palette.accent }]}>
        MONTHLY PLAN
      </Text>
      <View
        accessibilityLabel={`Monthly allocation. Budget base ${viewModel.budgetBaseLabel}. ${viewModel.allocationLabel}.`}
        style={[
          styles.allocationPanel,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="allocation-panel"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Budget base ${viewModel.budgetBaseLabel}. Open monthly Breakdown.`}
          onPress={() => onExplore(monthQuery(budget.monthKey))}
          style={styles.allocationHeader}
          testID="budget-base-drilldown"
        >
          <View>
            <Text style={[styles.label, { color: palette.muted }]}>
              AVAILABLE TO ALLOCATE
            </Text>
            <Text style={[styles.moneyHero, { color: palette.text }]}>
              {viewModel.budgetBaseLabel}
            </Text>
          </View>
          <Text style={[styles.ratioHero, { color: palette.text }]}>
            {viewModel.cards.map(({ ratioLabel }) => ratioLabel).join(' / ')}
          </Text>
        </Pressable>
        <View style={styles.allocationBody}>
          <AllocationRing
            editable={allocationEditable}
            palette={palette}
            ratios={draftRatios}
            onChange={setDraftRatios}
            onCommit={commitAllocation}
          />
          <View style={styles.allocationLegend}>
            {viewModel.cards.map((card) => (
              <View key={card.key} style={styles.allocationRow}>
                <View style={styles.identityRow}>
                  <View
                    style={[
                      styles.identityDot,
                      { backgroundColor: categoryColor(card.key, palette) },
                    ]}
                  />
                  <Text
                    style={[styles.bodyTextStrong, { color: palette.text }]}
                  >
                    {card.title}
                  </Text>
                  <Text style={[styles.smallText, { color: palette.muted }]}>
                    {card.ratioLabel}
                  </Text>
                </View>
                <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
                  {card.targetLabel}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.allocationActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit exact allocation percentages"
            accessibilityState={{ disabled: !allocationEditable }}
            disabled={!allocationEditable}
            onPress={() => setAllocationEditorOpen(true)}
            style={styles.secondaryButton}
            testID="allocation-edit-numeric"
          >
            <Text style={[styles.smallButtonText, { color: palette.accent }]}>
              Edit exact %
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset allocation to Living 50%, Saving 30%, Fun 20%"
            accessibilityState={{ disabled: !allocationEditable }}
            disabled={!allocationEditable}
            onPress={() => commitAllocation(DEFAULT_ALLOCATION)}
            style={styles.secondaryButton}
            testID="allocation-reset-default"
          >
            <Text style={[styles.smallButtonText, { color: palette.muted }]}>
              Reset 50 / 30 / 20
            </Text>
          </Pressable>
        </View>
        {!allocationEditable ? (
          <Text style={[styles.smallText, { color: palette.muted }]}>
            Historical allocation is read-only.
          </Text>
        ) : null}
        {allocationError === null ? null : (
          <Text accessibilityRole="alert" style={{ color: palette.breach }}>
            {allocationError}
          </Text>
        )}
      </View>

      {allocationEditorOpen ? (
        <AllocationEditor
          budget={budget}
          palette={palette}
          ratios={draftRatios}
          onCancel={() => setAllocationEditorOpen(false)}
          onSave={async (ratios) => {
            if (await commitAllocation(ratios)) {
              setAllocationEditorOpen(false);
            }
          }}
        />
      ) : null}

      {viewModel.needsReviewLabel === null ? null : (
        <Pressable
          accessibilityLabel={viewModel.needsReviewLabel}
          accessibilityRole="button"
          onPress={() =>
            onExplore(monthQuery(budget.monthKey, { needsReview: true }))
          }
          style={[
            styles.notice,
            {
              backgroundColor: palette.surfaceMuted,
              borderColor: palette.border,
            },
          ]}
          testID="needs-review"
        >
          <Text style={[styles.bodyText, { color: palette.text }]}>
            Review needed · {viewModel.needsReviewLabel}
          </Text>
        </Pressable>
      )}

      <Text
        accessibilityRole="header"
        style={[styles.sectionKicker, { color: palette.accent }]}
      >
        CURRENT POSITION
      </Text>
      <View
        style={[
          styles.positionPanel,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        {viewModel.cards.map((card) => (
          <BudgetCard
            key={card.key}
            card={card}
            palette={palette}
            scrollOffset={scrollOffset}
            onPress={() => onExplore(card.filter)}
          />
        ))}
      </View>

      <Text
        accessibilityRole="header"
        style={[styles.sectionKicker, { color: palette.accent }]}
      >
        MONTHLY SPENDING PACE
      </Text>
      <Text style={[styles.bodyText, { color: palette.muted }]}>
        Included Living and Fun spend only. Daily reference:{' '}
        {formatDailyReference(heatMap, budget.currency)}.
      </Text>
      <HeatMapCalendar
        currency={budget.currency}
        heatMap={heatMap}
        onSelectDate={(date) => onExplore(dayQuery(date))}
        palette={palette}
      />
      <Text style={[styles.sectionKicker, { color: palette.accent }]}>
        EXPERIMENTAL
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Experimental Money Map"
        onPress={onOpenMoneyMap}
        style={[
          styles.experimentalEntry,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="open-money-map"
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>
            Money Map
          </Text>
          <Text style={[styles.bodyText, { color: palette.muted }]}>
            Trace this month from budget base to allocations and categories.
          </Text>
        </View>
        <Badge label="Experimental" palette={palette} emphasized />
      </Pressable>
      <CoreNavigation
        active="HOME"
        palette={palette}
        onHome={() => undefined}
        onBreakdown={() => onExplore(monthQuery(budget.monthKey))}
        onTrends={onOpenTrends}
        onSubscriptions={onOpenSubscriptions}
        onSettings={onOpenSettings}
      />
    </ScrollView>
  );
}

function BudgetCard({
  card,
  palette,
  scrollOffset,
  onPress,
}: {
  readonly card: ReturnType<typeof createHomeViewModel>['cards'][number];
  readonly palette: Palette;
  readonly scrollOffset: number;
  readonly onPress: () => void;
}) {
  const progressWidth = progressPercent(card.percentageLabel);
  const identityColor = categoryColor(card.key, palette);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${card.title}. ${card.actualLabel} of ${card.targetLabel}. ${card.statusLabel}. ${card.percentageLabel}. Open matching transactions.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.positionRow,
        {
          borderBottomColor: palette.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      testID={`home-card-${card.key.toLowerCase()}`}
    >
      <View style={styles.cardTitleRow}>
        <View style={styles.identityRow}>
          <View
            style={[styles.identityDot, { backgroundColor: identityColor }]}
          />
          <Text style={[styles.cardTitle, { color: identityColor }]}>
            {card.title}
          </Text>
        </View>
        <Text
          style={[
            styles.positionStatus,
            { color: card.isOver ? palette.breach : palette.text },
          ]}
        >
          {card.statusLabel}
        </Text>
      </View>
      <View style={styles.cardFooter}>
        <Text style={[styles.bodyText, { color: palette.muted }]}>
          {card.actualLabel} of {card.targetLabel}
        </Text>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          {card.percentageLabel}
        </Text>
      </View>
      {card.key === 'SAVING' ? (
        <View
          accessibilityLabel={`${card.percentageLabel} of target`}
          style={[styles.track, { backgroundColor: palette.surfaceMuted }]}
        >
          <View
            style={[
              styles.progress,
              {
                width: `${progressWidth}%`,
                backgroundColor: identityColor,
              },
            ]}
          />
        </View>
      ) : (
        <RunoverVisual
          actualMinor={Math.max(0, card.actualMinor)}
          identityColor={identityColor}
          palette={palette}
          percentageLabel={card.percentageLabel}
          scrollOffset={scrollOffset}
          targetMinor={card.targetMinor}
        />
      )}
      {card.secondaryLabel === undefined ? null : (
        <Text style={[styles.smallText, { color: palette.warning }]}>
          {card.secondaryLabel}
        </Text>
      )}
    </Pressable>
  );
}

const RUNOVER_ROW_HEIGHT = 18;
const RUNOVER_WINDOW_SIZE = 36;

function RunoverVisual({
  actualMinor,
  identityColor,
  palette,
  percentageLabel,
  scrollOffset,
  targetMinor,
}: {
  readonly actualMinor: number;
  readonly identityColor: string;
  readonly palette: Palette;
  readonly percentageLabel: string;
  readonly scrollOffset: number;
  readonly targetMinor: number;
}) {
  const model = useMemo(
    () => createRunoverModel(actualMinor, targetMinor),
    [actualMinor, targetMinor],
  );
  const container = useRef<View>(null);
  const [contentY, setContentY] = useState(0);
  const start = model.virtualized
    ? Math.max(
        0,
        Math.floor((scrollOffset - contentY) / RUNOVER_ROW_HEIGHT) - 6,
      )
    : 0;
  const end = model.virtualized
    ? Math.min(model.rowCount, start + RUNOVER_WINDOW_SIZE)
    : model.rowCount;
  const visibleRows = Array.from({ length: end - start }, (_, offset) =>
    runoverRow(model, start + offset),
  );

  if (model.rowCount === 0) {
    return (
      <View
        accessibilityLabel={`${percentageLabel}. ${model.accessibilityRowSummary}`}
        style={[styles.track, { backgroundColor: palette.surfaceMuted }]}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${percentageLabel} of target. ${model.accessibilityRowSummary}`}
      onLayout={() =>
        container.current?.measureInWindow((_x, y) =>
          setContentY(y + scrollOffset),
        )
      }
      ref={container}
      style={[
        styles.runoverContainer,
        { height: model.rowCount * RUNOVER_ROW_HEIGHT },
      ]}
      testID="runover-visual"
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {visibleRows.map((row) => (
          <View
            key={row.index}
            style={[
              styles.runoverTrack,
              {
                backgroundColor: palette.surfaceMuted,
                top: row.index * RUNOVER_ROW_HEIGHT,
              },
            ]}
          >
            <View
              style={[
                styles.runoverFill,
                {
                  width: `${row.fillBasisPoints / 100}%`,
                  backgroundColor:
                    row.tone === 'IDENTITY' ? identityColor : palette.breach,
                },
              ]}
              testID={
                row.index === 0 ? 'runover-identity-row' : 'runover-breach-row'
              }
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const RING_SIZE = 190;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 70;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function AllocationRing({
  editable,
  palette,
  ratios,
  onChange,
  onCommit,
}: {
  readonly editable: boolean;
  readonly palette: Palette;
  readonly ratios: AllocationRatios;
  readonly onChange: (ratios: AllocationRatios) => void;
  readonly onCommit: (ratios: AllocationRatios) => Promise<boolean>;
}) {
  const activeBoundary = useRef<'LIVING' | 'SAVING' | null>(null);
  const ratiosRef = useRef(ratios);
  const savingEnd = ratios.LIVING + ratios.SAVING;
  const chooseBoundary = (event: GestureResponderEvent) => {
    ratiosRef.current = ratios;
    const basisPoints = touchBasisPoints(event);
    activeBoundary.current =
      circularDistance(basisPoints, ratios.LIVING) <=
      circularDistance(basisPoints, savingEnd)
        ? 'LIVING'
        : 'SAVING';
  };
  const updateBoundary = (event: GestureResponderEvent) => {
    if (!editable || activeBoundary.current === null) {
      return;
    }
    const touched = touchBasisPoints(event);
    const current = ratiosRef.current;
    const currentSavingEnd = current.LIVING + current.SAVING;
    const next =
      activeBoundary.current === 'LIVING'
        ? ratiosFromBoundaries(
            Math.min(touched, currentSavingEnd),
            currentSavingEnd,
          )
        : ratiosFromBoundaries(
            current.LIVING,
            Math.max(touched, current.LIVING),
          );
    ratiosRef.current = next;
    onChange(next);
  };

  return (
    <View
      accessibilityLabel={`Interactive allocation ring. Living ${formatBasisPointLabel(ratios.LIVING)}, Saving ${formatBasisPointLabel(ratios.SAVING)}, Fun ${formatBasisPointLabel(ratios.FUN)}. ${editable ? 'Drag either boundary or use Edit exact percent.' : 'Historical allocation is read-only.'}`}
      onMoveShouldSetResponder={() => editable}
      onResponderGrant={(event) => {
        chooseBoundary(event);
        updateBoundary(event);
      }}
      onResponderMove={updateBoundary}
      onResponderRelease={() => {
        activeBoundary.current = null;
        void onCommit(ratiosRef.current);
      }}
      onStartShouldSetResponder={() => editable}
      style={styles.ringContainer}
      testID="allocation-ring"
    >
      <Svg height={RING_SIZE} width={RING_SIZE}>
        <G origin={`${RING_CENTER}, ${RING_CENTER}`} rotation="-90">
          {[
            {
              key: 'LIVING',
              ratio: ratios.LIVING,
              start: 0,
              color: palette.living,
            },
            {
              key: 'SAVING',
              ratio: ratios.SAVING,
              start: ratios.LIVING,
              color: palette.saving,
            },
            {
              key: 'FUN',
              ratio: ratios.FUN,
              start: savingEnd,
              color: palette.fun,
            },
          ].map((segment) => (
            <Circle
              key={segment.key}
              cx={RING_CENTER}
              cy={RING_CENTER}
              fill="transparent"
              r={RING_RADIUS}
              stroke={segment.color}
              strokeDasharray={`${(RING_CIRCUMFERENCE * segment.ratio) / 10_000} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={-(RING_CIRCUMFERENCE * segment.start) / 10_000}
              strokeWidth={28}
            />
          ))}
        </G>
      </Svg>
      <View pointerEvents="none" style={styles.ringLabel}>
        <Text style={[styles.ringRatio, { color: palette.text }]}>
          {formatBasisPointLabel(ratios.LIVING)} /{' '}
          {formatBasisPointLabel(ratios.SAVING)} /{' '}
          {formatBasisPointLabel(ratios.FUN)}
        </Text>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          {editable ? 'DRAG BOUNDARIES' : 'HISTORICAL'}
        </Text>
      </View>
      {[ratios.LIVING, savingEnd].map((boundary, index) => {
        const position = boundaryPosition(boundary);
        return (
          <View
            key={index === 0 ? 'living-boundary' : 'saving-boundary'}
            pointerEvents="none"
            style={[
              styles.ringHandle,
              {
                backgroundColor: palette.text,
                left: position.x - 15,
                top: position.y - 15,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function AllocationEditor({
  budget,
  palette,
  ratios,
  onCancel,
  onSave,
}: {
  readonly budget: NonNullable<LedgerSnapshot['ledgerMonth']>['budget'];
  readonly palette: Palette;
  readonly ratios: AllocationRatios;
  readonly onCancel: () => void;
  readonly onSave: (ratios: AllocationRatios) => Promise<void>;
}) {
  const [living, setLiving] = useState(formatBasisPointInput(ratios.LIVING));
  const [saving, setSaving] = useState(formatBasisPointInput(ratios.SAVING));
  const [fun, setFun] = useState(formatBasisPointInput(ratios.FUN));
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible>
      <View style={styles.modalBackdrop}>
        <View
          accessibilityViewIsModal
          style={[
            styles.modalCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: palette.text }]}>
            Edit monthly allocation
          </Text>
          <Text style={[styles.bodyText, { color: palette.muted }]}>
            Percentages use up to two decimal places and must total exactly
            100%. Changes apply only to {budget.monthKey}.
          </Text>
          {[
            ['Living', living, setLiving, palette.living],
            ['Saving', saving, setSaving, palette.saving],
            ['Fun', fun, setFun, palette.fun],
          ].map(([label, value, setter, color]) => (
            <View key={String(label)} style={styles.editorRow}>
              <Text style={[styles.bodyTextStrong, { color: String(color) }]}>
                {String(label)}
              </Text>
              <View style={styles.inputWrap}>
                <TextInput
                  accessibilityLabel={`${String(label)} percentage`}
                  keyboardType="decimal-pad"
                  onChangeText={setter as (value: string) => void}
                  selectTextOnFocus
                  style={[
                    styles.percentageInput,
                    {
                      borderColor: palette.border,
                      color: palette.text,
                    },
                  ]}
                  value={String(value)}
                />
                <Text style={[styles.bodyText, { color: palette.muted }]}>
                  %
                </Text>
              </View>
            </View>
          ))}
          {error === null ? null : (
            <Text accessibilityRole="alert" style={{ color: palette.breach }}>
              {error}
            </Text>
          )}
          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.secondaryButton}
            >
              <Text style={[styles.smallButtonText, { color: palette.muted }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                try {
                  const next = parseAllocationPercentages(living, saving, fun);
                  setError(null);
                  void onSave(next);
                } catch {
                  setError('Enter percentages that total exactly 100%.');
                }
              }}
              style={[styles.modalSave, { backgroundColor: palette.accent }]}
              testID="allocation-save"
            >
              <Text
                style={[styles.smallButtonText, { color: palette.accentText }]}
              >
                Save allocation
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function HeatMapCalendar({
  currency,
  heatMap,
  onSelectDate,
  palette,
}: {
  readonly currency: string;
  readonly heatMap: MonthlyHeatMap;
  readonly onSelectDate: (date: string) => void;
  readonly palette: Palette;
}) {
  return (
    <View
      style={[
        styles.heatMapPanel,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      testID="monthly-heat-map"
    >
      <ScrollView
        accessibilityLabel="Monthly spending calendar"
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <View style={styles.calendarContent}>
          <View
            accessibilityRole="header"
            importantForAccessibility="no-hide-descendants"
            style={styles.weekRow}
          >
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <Text
                key={day}
                style={[styles.weekLabel, { color: palette.muted }]}
              >
                {day.slice(0, 1)}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {Array.from({ length: heatMap.leadingBlankCount }, (_, index) => (
              <View key={`blank:${index}`} style={styles.calendarCell} />
            ))}
            {heatMap.days.map((day) => (
              <Pressable
                key={day.date}
                accessibilityRole="button"
                accessibilityLabel={heatMapDayLabel(
                  formatActivityDate(day.date),
                  formatMoney(money(day.amountMinor, currency), 'en-GB'),
                  day.status,
                )}
                onPress={() => onSelectDate(day.date)}
                style={[
                  styles.calendarCell,
                  { backgroundColor: heatColor(day, palette) },
                ]}
                testID={`day-${day.date}`}
              >
                <Text style={[styles.calendarDay, { color: palette.text }]}>
                  {day.day}
                </Text>
                <Text
                  importantForAccessibility="no"
                  style={[styles.calendarCue, { color: palette.text }]}
                >
                  {visibleHeatMapCue(day.tone)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={styles.heatLegend}>
        <View
          style={[
            styles.legendSwatch,
            { backgroundColor: palette.surfaceMuted },
          ]}
        />
        <Text style={[styles.legendText, { color: palette.muted }]}>– £0</Text>
        <View
          style={[styles.legendGradientGreen, { backgroundColor: palette.fun }]}
        />
        <Text style={[styles.legendText, { color: palette.muted }]}>
          • up to daily reference
        </Text>
        <View
          style={[
            styles.legendGradientRed,
            { backgroundColor: palette.breach },
          ]}
        />
        <Text style={[styles.legendText, { color: palette.muted }]}>
          ! over daily reference
        </Text>
      </View>
    </View>
  );
}

type SubscriptionLoadState =
  | { readonly status: 'LOADING' | 'ERROR' }
  | {
      readonly status: 'READY';
      readonly records: readonly SubscriptionRecord[];
      readonly suggestions: readonly SubscriptionSuggestion[];
      readonly categories: readonly Category[];
    };

function SubscriptionsScreen({
  database,
  onExplore,
  onHome,
  onOpenBreakdown,
  onOpenTrends,
  onOpenSettings,
  palette,
}: {
  readonly database: Database;
  readonly onExplore: (subscriptionId: string, currency: string) => void;
  readonly onHome: () => void;
  readonly onOpenBreakdown: () => void;
  readonly onOpenTrends: () => void;
  readonly onOpenSettings: () => void;
  readonly palette: Palette;
}) {
  const [state, setState] = useState<SubscriptionLoadState>({
    status: 'LOADING',
  });
  const [editing, setEditing] = useState<SubscriptionRecord | 'NEW' | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const refreshSubscriptions = useCallback(async () => {
    setState({ status: 'LOADING' });
    try {
      setState(await loadSubscriptionScreenState(database));
    } catch {
      setState({ status: 'ERROR' });
    }
  }, [database]);
  useEffect(() => {
    let active = true;
    loadSubscriptionScreenState(database).then(
      (nextState) => {
        if (active) {
          setState(nextState);
        }
      },
      () => {
        if (active) {
          setState({ status: 'ERROR' });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [database]);

  const readyState = state.status === 'READY' ? state : null;
  const summaries =
    readyState === null
      ? []
      : summarizeSubscriptions(readyState.records, '2026-09-24');
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      testID="subscriptions-screen"
    >
      <Text style={[styles.demoPill, { color: palette.accent }]}>
        SUBSCRIPTIONS · LOCAL METADATA
      </Text>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={[styles.screenTitle, { color: palette.text }]}
          >
            Recurring commitments
          </Text>
          <Text style={[styles.bodyText, { color: palette.muted }]}>
            Monthly equivalents and reserves are analytical only. Actual
            spending remains the real linked transactions.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Add subscription"
          accessibilityRole="button"
          onPress={() => setEditing('NEW')}
          style={[styles.secondaryButton, { backgroundColor: palette.accent }]}
          testID="subscription-create"
        >
          <Text style={[styles.smallButtonText, { color: palette.accentText }]}>
            Add
          </Text>
        </Pressable>
      </View>

      {state.status === 'LOADING' ? (
        <View
          accessibilityLabel={asyncStateLabel('local subscriptions', 'LOADING')}
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy: true }}
          style={styles.trendLoading}
          testID="subscriptions-loading"
        >
          <ActivityIndicator
            accessibilityElementsHidden
            color={palette.accent}
          />
          <Text style={[styles.bodyText, { color: palette.muted }]}>
            Loading local subscriptions…
          </Text>
        </View>
      ) : state.status === 'ERROR' ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.notice,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          testID="subscriptions-error"
        >
          <Text style={[styles.bodyText, { color: palette.text }]}>
            Subscription metadata could not be loaded from local storage.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refreshSubscriptions()}
            style={styles.secondaryButton}
            testID="subscriptions-retry"
          >
            <Text style={[styles.smallButtonText, { color: palette.accent }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {summaries.map((summary) => (
            <View
              accessible
              key={summary.currency}
              accessibilityLabel={`${summary.currency} subscription summary`}
              style={[
                styles.subscriptionSummary,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
              testID={`subscription-summary-${summary.currency}`}
            >
              <Text style={[styles.label, { color: palette.muted }]}>
                {summary.currency} · NO FX MIXING
              </Text>
              <Text style={[styles.moneyHero, { color: palette.text }]}>
                {formatMoney(
                  money(summary.totalMonthlyEquivalentMinor, summary.currency),
                  'en-GB',
                )}
                /month
              </Text>
              <View style={styles.summaryRow}>
                <SummaryMetric
                  label="Monthly"
                  palette={palette}
                  value={formatMoney(
                    money(
                      summary.confirmedMonthlyEquivalentMinor,
                      summary.currency,
                    ),
                    'en-GB',
                  )}
                />
                <SummaryMetric
                  label="Long interval"
                  palette={palette}
                  value={formatMoney(
                    money(
                      summary.longIntervalMonthlyEquivalentMinor,
                      summary.currency,
                    ),
                    'en-GB',
                  )}
                />
              </View>
              <Text style={[styles.smallText, { color: palette.muted }]}>
                Renewals: {summary.renewalsIn30Days} in 30 days ·{' '}
                {summary.renewalsIn90Days} in 90 days
              </Text>
            </View>
          ))}

          {readyState !== null && readyState.suggestions.length > 0 ? (
            <>
              <Text style={[styles.sectionKicker, { color: palette.warning }]}>
                UNCONFIRMED SUGGESTIONS
              </Text>
              <Text style={[styles.smallText, { color: palette.muted }]}>
                Deterministic merchant, amount and repeated-interval evidence.
                Nothing is tracked until you confirm.
              </Text>
              {readyState.suggestions.map((suggestion) => (
                <View
                  key={suggestion.signature}
                  style={[
                    styles.subscriptionCard,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.warning,
                    },
                  ]}
                  testID={`subscription-suggestion-${suggestion.signature}`}
                >
                  <View style={styles.cardTitleRow}>
                    <Text style={[styles.cardTitle, { color: palette.text }]}>
                      {suggestion.name}
                    </Text>
                    <Badge
                      label={`Suggested · ${suggestion.confidence.toLowerCase()} confidence`}
                      palette={palette}
                      emphasized
                    />
                  </View>
                  <Text
                    style={[styles.bodyTextStrong, { color: palette.text }]}
                  >
                    {formatMoney(
                      money(
                        suggestion.billingAmountMinor,
                        suggestion.billingCurrency,
                      ),
                      'en-GB',
                    )}{' '}
                    every {formatSubscriptionInterval(suggestion)}
                  </Text>
                  <Text style={[styles.smallText, { color: palette.muted }]}>
                    {suggestion.evidenceCount} matching payments · next expected{' '}
                    {suggestion.nextExpectedDate}
                  </Text>
                  <View style={styles.subscriptionActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setActionError(null);
                        confirmSubscriptionSuggestion(
                          database,
                          suggestion,
                          `subscription:confirmed:${suggestion.signature}`,
                          '2026-09-24T17:00:00.000Z',
                        )
                          .then(refreshSubscriptions)
                          .catch(() =>
                            setActionError(
                              'The suggestion could not be confirmed.',
                            ),
                          );
                      }}
                      style={[
                        styles.secondaryButton,
                        { backgroundColor: palette.accent },
                      ]}
                      testID={`subscription-confirm-${suggestion.signature}`}
                    >
                      <Text
                        style={[
                          styles.smallButtonText,
                          { color: palette.accentText },
                        ]}
                      >
                        Confirm
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setActionError(null);
                        denySubscriptionSuggestion(
                          database,
                          suggestion.signature,
                          '2026-09-24T17:00:00.000Z',
                        )
                          .then(refreshSubscriptions)
                          .catch(() =>
                            setActionError(
                              'The suggestion could not be dismissed.',
                            ),
                          );
                      }}
                      style={styles.secondaryButton}
                      testID={`subscription-deny-${suggestion.signature}`}
                    >
                      <Text
                        style={[
                          styles.smallButtonText,
                          { color: palette.muted },
                        ]}
                      >
                        Not a subscription
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </>
          ) : null}

          <Text style={[styles.sectionKicker, { color: palette.accent }]}>
            TRACKED
          </Text>
          {readyState === null || readyState.records.length === 0 ? (
            <View
              accessible
              accessibilityLabel={asyncStateLabel('subscriptions', 'EMPTY')}
              style={[
                styles.notice,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
              testID="subscriptions-empty"
            >
              <Text style={[styles.bodyText, { color: palette.text }]}>
                No subscriptions are tracked. Add one manually or confirm a
                suggestion.
              </Text>
            </View>
          ) : (
            readyState.records.map((record) => (
              <SubscriptionCard
                key={record.subscription.id}
                onDisable={() => {
                  setActionError(null);
                  disableSubscription(
                    database,
                    record.subscription.id,
                    '2026-09-24T17:00:00.000Z',
                  )
                    .then(refreshSubscriptions)
                    .catch(() =>
                      setActionError('The subscription could not be disabled.'),
                    );
                }}
                onEdit={() => setEditing(record)}
                onExplore={() =>
                  onExplore(
                    record.subscription.id,
                    record.subscription.billingCurrency,
                  )
                }
                palette={palette}
                record={record}
              />
            ))
          )}
          {actionError === null ? null : (
            <Text accessibilityRole="alert" style={{ color: palette.breach }}>
              {actionError}
            </Text>
          )}
          {editing === null ? null : (
            <SubscriptionEditor
              categories={readyState?.categories ?? []}
              database={database}
              existing={editing === 'NEW' ? null : editing}
              nextId={`subscription:manual:${(readyState?.records.length ?? 0) + 1}`}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                void refreshSubscriptions();
              }}
              palette={palette}
            />
          )}
        </>
      )}
      <CoreNavigation
        active="SUBSCRIPTIONS"
        onBreakdown={onOpenBreakdown}
        onHome={onHome}
        onSubscriptions={() => undefined}
        onSettings={onOpenSettings}
        onTrends={onOpenTrends}
        palette={palette}
      />
    </ScrollView>
  );
}

async function loadSubscriptionScreenState(
  database: Database,
): Promise<Extract<SubscriptionLoadState, { status: 'READY' }>> {
  const [records, suggestions, categories] = await Promise.all([
    listSubscriptions(database, '2026-09-24', true),
    detectSubscriptionSuggestions(database),
    listCategories(database),
  ]);
  return { status: 'READY', records, suggestions, categories };
}

function SubscriptionCard({
  onDisable,
  onEdit,
  onExplore,
  palette,
  record,
}: {
  readonly onDisable: () => void;
  readonly onEdit: () => void;
  readonly onExplore: () => void;
  readonly palette: Palette;
  readonly record: SubscriptionRecord;
}) {
  const { subscription } = record;
  return (
    <View
      accessibilityLabel={`${subscription.name}, ${record.monthlyEquivalentLabel}, ${subscription.active ? 'active' : 'tracking stopped'}`}
      style={[
        styles.subscriptionCard,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          opacity: subscription.active ? 1 : 0.65,
        },
      ]}
      testID={`subscription-card-${subscription.id}`}
    >
      <View style={styles.cardTitleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: palette.text }]}>
            {subscription.name}
          </Text>
          <Text style={[styles.smallText, { color: palette.muted }]}>
            {subscription.detectionState.toLowerCase()} ·{' '}
            {subscription.active ? 'Tracking' : 'Tracking stopped'}
          </Text>
        </View>
        <Text style={[styles.cardAmount, { color: palette.text }]}>
          {record.monthlyEquivalentLabel}
        </Text>
      </View>
      <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
        Last amount{' '}
        {formatMoney(
          money(subscription.billingAmountMinor, subscription.billingCurrency),
          'en-GB',
        )}{' '}
        · every {formatSubscriptionInterval(subscription)}
      </Text>
      <View style={styles.badgeRow}>
        <Badge
          label={`Renewal: ${renewalIntentLabel(subscription.renewalIntent)}`}
          palette={palette}
          emphasized={false}
        />
        <Badge
          label={
            subscription.nextExpectedDate === null
              ? 'Next renewal unknown'
              : `Next ${subscription.nextExpectedDate}`
          }
          palette={palette}
          emphasized={false}
        />
        <Badge
          label={
            record.reservePlan === null
              ? 'No reserve plan'
              : `Reserve ${record.requiredReserveLabel ?? 'disabled'}`
          }
          palette={palette}
          emphasized={false}
        />
      </View>
      <Text style={[styles.smallText, { color: palette.muted }]}>
        Last payment {subscription.lastPaymentDate ?? 'unknown'} ·{' '}
        {record.linkedTransactionIds.length} linked real payment
        {record.linkedTransactionIds.length === 1 ? '' : 's'}
      </Text>
      <View style={styles.subscriptionActions}>
        <Pressable
          accessibilityLabel={`Open ${subscription.name} Breakdown`}
          accessibilityRole="button"
          onPress={onExplore}
          style={styles.secondaryButton}
          testID={`subscription-breakdown-${subscription.id}`}
        >
          <Text style={[styles.smallButtonText, { color: palette.accent }]}>
            Breakdown
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Edit ${subscription.name}`}
          accessibilityRole="button"
          onPress={onEdit}
          style={styles.secondaryButton}
          testID={`subscription-edit-${subscription.id}`}
        >
          <Text style={[styles.smallButtonText, { color: palette.accent }]}>
            Edit
          </Text>
        </Pressable>
        {subscription.active ? (
          <Pressable
            accessibilityLabel={`Stop tracking ${subscription.name}`}
            accessibilityRole="button"
            onPress={onDisable}
            style={styles.secondaryButton}
            testID={`subscription-disable-${subscription.id}`}
          >
            <Text style={[styles.smallButtonText, { color: palette.muted }]}>
              Stop tracking
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SubscriptionEditor({
  categories,
  database,
  existing,
  nextId,
  onCancel,
  onSaved,
  palette,
}: {
  readonly categories: readonly Category[];
  readonly database: Database;
  readonly existing: SubscriptionRecord | null;
  readonly nextId: string;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
  readonly palette: Palette;
}) {
  const reducedMotion = useReducedMotion();
  const current = existing?.subscription;
  const [name, setName] = useState(current?.name ?? '');
  const [amount, setAmount] = useState(
    current === undefined ? '' : formatMinorInput(current.billingAmountMinor),
  );
  const [currency, setCurrency] = useState(current?.billingCurrency ?? 'GBP');
  const [intervalKind, setIntervalKind] = useState<'MONTHS' | 'DAYS'>(
    current?.intervalDays === null || current === undefined ? 'MONTHS' : 'DAYS',
  );
  const [interval, setInterval] = useState(
    String(current?.intervalMonths ?? current?.intervalDays ?? 1),
  );
  const [lastPayment, setLastPayment] = useState(
    current?.lastPaymentDate ?? '',
  );
  const [nextExpected, setNextExpected] = useState(
    current?.nextExpectedDate ?? '',
  );
  const [renewalIntent, setRenewalIntent] = useState<RenewalIntent>(
    current?.renewalIntent ?? 'UNKNOWN',
  );
  const [categoryId, setCategoryId] = useState(
    current?.categoryId ?? 'category:subscriptions',
  );
  const [reserveEnabled, setReserveEnabled] = useState(
    existing?.reservePlan?.enabled ?? false,
  );
  const [reserveTarget, setReserveTarget] = useState(
    existing?.reservePlan === null || existing?.reservePlan === undefined
      ? ''
      : formatMinorInput(existing.reservePlan.targetAmountMinor),
  );
  const [reserved, setReserved] = useState(
    existing?.reservePlan === null || existing?.reservePlan === undefined
      ? '0.00'
      : formatMinorInput(existing.reservePlan.reservedAmountMinor),
  );
  const [reserveDate, setReserveDate] = useState(
    existing?.reservePlan?.targetDate ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const commit = async () => {
    setError(null);
    try {
      const parsedAmount = parseDecimalMoney(amount, currency);
      const parsedInterval = Number(interval);
      const timestamp = '2026-09-24T17:00:00.000Z';
      const id = current?.id ?? nextId;
      const subscriptionInput = {
        id,
        name,
        merchantMatch: current?.merchantMatch ?? name,
        billingAmountMinor: parsedAmount.amountMinor,
        billingCurrency: parsedAmount.currency,
        intervalMonths: intervalKind === 'MONTHS' ? parsedInterval : null,
        intervalDays: intervalKind === 'DAYS' ? parsedInterval : null,
        lastPaymentDate: lastPayment.trim() === '' ? null : lastPayment.trim(),
        nextExpectedDate:
          nextExpected.trim() === '' ? null : nextExpected.trim(),
        detectionState: current?.detectionState ?? 'MANUAL',
        renewalIntent,
        categoryId,
        active: current?.active ?? true,
        createdAt: current?.createdAt ?? timestamp,
        updatedAt: timestamp,
      } as const;
      const reserveInput = reserveEnabled
        ? {
            id: existing?.reservePlan?.id ?? `reserve:${id}`,
            subscriptionId: id,
            targetAmountMinor: parseDecimalMoney(reserveTarget, currency)
              .amountMinor,
            targetCurrency: parsedAmount.currency,
            reservedAmountMinor: parseDecimalMoney(reserved, currency)
              .amountMinor,
            targetDate: reserveDate,
            enabled: true,
            createdAt: existing?.reservePlan?.createdAt ?? timestamp,
            updatedAt: timestamp,
          }
        : existing?.reservePlan === null || existing === null
          ? null
          : {
              ...existing.reservePlan,
              enabled: false,
              updatedAt: timestamp,
            };
      await saveSubscriptionDetails(database, subscriptionInput, reserveInput);
      onSaved();
    } catch {
      setError(
        'Check the amount, currency, one positive interval, dates, category and reserve values.',
      );
    }
  };
  return (
    <Modal
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onCancel}
      transparent
      visible
    >
      <ScrollView
        contentContainerStyle={styles.modalScroll}
        style={styles.modalScrollView}
      >
        <View
          accessibilityViewIsModal
          style={[
            styles.modalCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          testID="subscription-editor"
        >
          <Text
            accessibilityRole="header"
            style={[styles.cardTitle, { color: palette.text }]}
          >
            {current === undefined ? 'Add subscription' : 'Edit subscription'}
          </Text>
          <TextInput
            accessibilityLabel="Subscription name"
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={palette.muted}
            style={[
              styles.textField,
              { borderColor: palette.border, color: palette.text },
            ]}
            testID="subscription-name"
            value={name}
          />
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Billing amount"
              keyboardType="decimal-pad"
              onChangeText={setAmount}
              placeholder="90.00"
              placeholderTextColor={palette.muted}
              style={[
                styles.textField,
                styles.flexField,
                { borderColor: palette.border, color: palette.text },
              ]}
              testID="subscription-amount"
              value={amount}
            />
            <TextInput
              accessibilityLabel="Billing currency"
              autoCapitalize="characters"
              maxLength={3}
              onChangeText={setCurrency}
              style={[
                styles.textField,
                { width: 82, borderColor: palette.border, color: palette.text },
              ]}
              testID="subscription-currency"
              value={currency}
            />
          </View>
          <ChoiceGroup
            label="Interval unit"
            onSelect={setIntervalKind}
            choices={[
              { key: 'MONTHS', label: 'Months' },
              { key: 'DAYS', label: 'Days' },
            ]}
            palette={palette}
            selected={intervalKind}
          />
          <TextInput
            accessibilityLabel={`Billing interval in ${intervalKind.toLowerCase()}`}
            keyboardType="number-pad"
            onChangeText={setInterval}
            placeholder="12"
            placeholderTextColor={palette.muted}
            style={[
              styles.textField,
              { borderColor: palette.border, color: palette.text },
            ]}
            testID="subscription-interval"
            value={interval}
          />
          <View style={styles.inputRow}>
            <TextInput
              accessibilityLabel="Last payment date"
              onChangeText={setLastPayment}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muted}
              style={[
                styles.textField,
                styles.flexField,
                { borderColor: palette.border, color: palette.text },
              ]}
              testID="subscription-last-payment"
              value={lastPayment}
            />
            <TextInput
              accessibilityLabel="Next expected renewal date"
              onChangeText={setNextExpected}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.muted}
              style={[
                styles.textField,
                styles.flexField,
                { borderColor: palette.border, color: palette.text },
              ]}
              testID="subscription-next-renewal"
              value={nextExpected}
            />
          </View>
          <ChoiceGroup
            label="Renewal intent"
            onSelect={setRenewalIntent}
            choices={[
              { key: 'COMMITTED', label: 'Committed' },
              { key: 'LIKELY', label: 'Likely' },
              { key: 'UNKNOWN', label: 'Unknown' },
              { key: 'NOT_RENEWING', label: 'Not renewing' },
            ]}
            palette={palette}
            selected={renewalIntent}
          />
          <ChoiceGroup
            label="Category"
            onSelect={setCategoryId}
            choices={categories.map((category) => ({
              key: category.id,
              label: category.name,
            }))}
            palette={palette}
            selected={categoryId}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: reserveEnabled }}
            onPress={() => setReserveEnabled((value) => !value)}
            style={styles.checkRow}
            testID="subscription-reserve-toggle"
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: palette.accent,
                  backgroundColor: reserveEnabled
                    ? palette.accent
                    : 'transparent',
                },
              ]}
            />
            <Text style={[styles.bodyText, { color: palette.text }]}>
              Optional reserve plan
            </Text>
          </Pressable>
          {reserveEnabled ? (
            <>
              <View style={styles.inputRow}>
                <TextInput
                  accessibilityLabel="Reserve target amount"
                  keyboardType="decimal-pad"
                  onChangeText={setReserveTarget}
                  placeholder="90.00"
                  placeholderTextColor={palette.muted}
                  style={[
                    styles.textField,
                    styles.flexField,
                    { borderColor: palette.border, color: palette.text },
                  ]}
                  testID="subscription-reserve-target"
                  value={reserveTarget}
                />
                <TextInput
                  accessibilityLabel="Amount already reserved"
                  keyboardType="decimal-pad"
                  onChangeText={setReserved}
                  placeholder="30.00"
                  placeholderTextColor={palette.muted}
                  style={[
                    styles.textField,
                    styles.flexField,
                    { borderColor: palette.border, color: palette.text },
                  ]}
                  testID="subscription-reserved"
                  value={reserved}
                />
              </View>
              <TextInput
                accessibilityLabel="Reserve target date"
                onChangeText={setReserveDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={palette.muted}
                style={[
                  styles.textField,
                  { borderColor: palette.border, color: palette.text },
                ]}
                testID="subscription-reserve-date"
                value={reserveDate}
              />
            </>
          ) : null}
          {error === null ? null : (
            <Text accessibilityRole="alert" style={{ color: palette.breach }}>
              {error}
            </Text>
          )}
          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.secondaryButton}
            >
              <Text style={[styles.smallButtonText, { color: palette.muted }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void commit()}
              style={[styles.modalSave, { backgroundColor: palette.accent }]}
              testID="subscription-save"
            >
              <Text
                style={[styles.smallButtonText, { color: palette.accentText }]}
              >
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

function formatSubscriptionInterval(
  value: Pick<
    SubscriptionSuggestion | SubscriptionRecord['subscription'],
    'intervalMonths' | 'intervalDays'
  >,
): string {
  return value.intervalMonths === null
    ? `${value.intervalDays} day${value.intervalDays === 1 ? '' : 's'}`
    : `${value.intervalMonths} month${value.intervalMonths === 1 ? '' : 's'}`;
}

function renewalIntentLabel(intent: RenewalIntent): string {
  return {
    COMMITTED: 'Committed',
    LIKELY: 'Likely',
    UNKNOWN: 'Unknown',
    NOT_RENEWING: 'Not renewing',
  }[intent];
}

type SettingsLoadState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'ERROR' }
  | { readonly status: 'READY'; readonly readiness: LocalReadiness };

const DEFAULT_MONZO_SUMMARY: MonzoConnectionSummary = {
  authState: 'DEMO_NOT_CONNECTED',
  networkEnabled: false,
  mockLastSyncedAt: null,
  mockHistory: 'NONE',
};

function SettingsScreen({
  database,
  onDataChanged,
  onHome,
  onOpenBreakdown,
  onOpenSubscriptions,
  onOpenTrends,
  palette,
}: {
  readonly database: Database;
  readonly onDataChanged: () => Promise<void>;
  readonly onHome: () => void;
  readonly onOpenBreakdown: () => void;
  readonly onOpenSubscriptions: () => void;
  readonly onOpenTrends: () => void;
  readonly palette: Palette;
}) {
  const [state, setState] = useState<SettingsLoadState>({
    status: 'LOADING',
  });
  const [busyAction, setBusyAction] = useState<
    'EXPORT' | 'RESTORE' | 'WIPE' | 'MOCK_SYNC' | null
  >(null);
  const [monzoSummary, setMonzoSummary] = useState<MonzoConnectionSummary>(
    DEFAULT_MONZO_SUMMARY,
  );
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreText, setRestoreText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshReadiness = useCallback(async () => {
    setState({ status: 'LOADING' });
    try {
      setState({
        status: 'READY',
        readiness: await getLocalReadiness(database),
      });
    } catch {
      setState({ status: 'ERROR' });
    }
  }, [database]);

  useEffect(() => {
    void getLocalReadiness(database).then(
      (readiness) => setState({ status: 'READY', readiness }),
      () => setState({ status: 'ERROR' }),
    );
  }, [database]);

  useEffect(() => {
    void getMonzoConnectionSummary(database).then(setMonzoSummary, () =>
      setMonzoSummary(DEFAULT_MONZO_SUMMARY),
    );
  }, [database]);

  const runMockSync = useCallback(async () => {
    const now = new Date().toISOString();
    setBusyAction('MOCK_SYNC');
    setError(null);
    setMessage(null);
    let result;
    try {
      result = await syncMonzo(database, new MockMonzoApi(), {
        source: 'monzo_mock',
        authenticatedAt: now,
        now,
      });
    } catch {
      setError('Mock sync failed. No partial sync was saved.');
      setBusyAction(null);
      return;
    }
    try {
      setMonzoSummary(await getMonzoConnectionSummary(database));
      await onDataChanged();
      setMessage(
        `Synthetic Monzo-shaped data synced locally (${result.mode.toLowerCase()}).`,
      );
    } catch {
      setError(
        'Mock sync completed, but the refreshed view is unavailable. Restart the app to continue.',
      );
    } finally {
      setBusyAction(null);
    }
  }, [database, onDataChanged]);

  const shareExport = useCallback(async () => {
    setBusyAction('EXPORT');
    setError(null);
    setMessage(null);
    try {
      const portable = await exportLocalData(
        database,
        new Date().toISOString(),
      );
      await Share.share({
        title: 'Vibe Ledger local data export',
        message: serializePortableExport(portable),
      });
      setMessage('The export share sheet was closed.');
    } catch {
      setError('The local data export could not be prepared or shared.');
    } finally {
      setBusyAction(null);
    }
  }, [database]);

  const confirmExport = () => {
    Alert.alert('Export sensitive financial data?', PORTABLE_EXPORT_WARNING, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue to Share', onPress: () => void shareExport() },
    ]);
  };

  const runRestore = async (input: unknown) => {
    setBusyAction('RESTORE');
    setError(null);
    setMessage(null);
    try {
      await restoreLocalData(database, input);
    } catch {
      setError('Restore failed. Current local data was not replaced.');
      setBusyAction(null);
      return;
    }
    try {
      await onDataChanged();
      await refreshReadiness();
      setMonzoSummary(await getMonzoConnectionSummary(database));
      setRestoreOpen(false);
      setRestoreText('');
      setMessage('Local data restored.');
    } catch {
      setError(
        'Local data was restored, but the refreshed view is unavailable. Restart the app to continue.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const confirmRestore = () => {
    let input: unknown;
    try {
      input = parseRestoreText(restoreText);
    } catch {
      setError('The pasted restore data is not valid JSON.');
      return;
    }
    Alert.alert(
      'Replace all local ledger data?',
      'Restore validates the export, then replaces current local ledger data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace and restore',
          style: 'destructive',
          onPress: () => void runRestore(input),
        },
      ],
    );
  };

  const runWipe = async () => {
    setBusyAction('WIPE');
    setError(null);
    setMessage(null);
    try {
      await wipeMonzoConnection(database, new ExpoSecureTokenStore());
      await wipeLocalData(database);
    } catch {
      setError('Local data could not be deleted. Try again.');
      setBusyAction(null);
      return;
    }
    try {
      await onDataChanged();
      setMonzoSummary(DEFAULT_MONZO_SUMMARY);
    } catch {
      setError(
        'Local data was deleted, but the empty view is unavailable. Restart the app to continue.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const confirmWipe = () => {
    Alert.alert(
      'Delete all local ledger data?',
      'This permanently removes transactions, classifications, subscriptions, rules, and demo records from this app. Export first if you need a copy.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all local data',
          style: 'destructive',
          onPress: () => void runWipe(),
        },
      ],
    );
  };

  const busy = busyAction !== null;
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      testID="settings-screen"
    >
      <Text style={[styles.demoPill, { color: palette.accent }]}>
        SETTINGS · LOCAL DATA
      </Text>
      <Text
        accessibilityRole="header"
        style={[styles.screenTitle, { color: palette.text }]}
      >
        Privacy and local storage
      </Text>
      <Text style={[styles.bodyText, { color: palette.muted }]}>
        This beta works from its app-private SQLite database and does not need a
        network connection.
      </Text>

      <View
        style={[
          styles.settingsCard,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="monzo-connection"
      >
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, { color: palette.text }]}
        >
          Monzo connection
        </Text>
        <Badge label="Demo · Not connected" palette={palette} emphasized />
        <Text style={[styles.bodyText, { color: palette.muted }]}>
          Live Monzo authorization is disabled. This app never connects
          automatically or syncs in the background.
        </Text>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          {monzoSummary.mockLastSyncedAt === null
            ? 'No mock sync has run.'
            : `Last mock sync: ${formatLocalDataChange(monzoSummary.mockLastSyncedAt)} · ${monzoSummary.mockHistory.toLowerCase()} history`}
        </Text>
        {DEMO_MODE_ENABLED ? (
          <Pressable
            accessibilityLabel="Run synthetic Monzo mock sync"
            accessibilityRole="button"
            accessibilityState={{
              busy: busyAction === 'MOCK_SYNC',
              disabled: busy,
            }}
            disabled={busy}
            onPress={() => void runMockSync()}
            style={styles.secondaryButton}
            testID="settings-monzo-mock-sync"
          >
            <Text style={[styles.smallButtonText, { color: palette.accent }]}>
              {busyAction === 'MOCK_SYNC'
                ? 'Syncing mock data…'
                : 'Run mock sync'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={[
          styles.settingsCard,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="local-readiness"
      >
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, { color: palette.text }]}
        >
          Offline readiness
        </Text>
        {state.status === 'LOADING' ? (
          <View
            accessibilityLabel={asyncStateLabel('local readiness', 'LOADING')}
            accessibilityLiveRegion="polite"
            accessibilityState={{ busy: true }}
            style={styles.inlineStatus}
          >
            <ActivityIndicator
              accessibilityElementsHidden
              color={palette.accent}
            />
            <Text style={[styles.bodyText, { color: palette.muted }]}>
              Checking local storage…
            </Text>
          </View>
        ) : state.status === 'ERROR' ? (
          <View accessibilityRole="alert" style={styles.settingsSection}>
            <Text style={[styles.bodyText, { color: palette.text }]}>
              Local readiness could not be checked.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void refreshReadiness()}
              style={styles.secondaryButton}
              testID="settings-readiness-retry"
            >
              <Text style={[styles.smallButtonText, { color: palette.accent }]}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            accessible
            accessibilityLabel={`Ready offline. Local SQLite storage. No network required. Schema version ${state.readiness.schemaVersion}. Integrity check passed. Last local data change: ${formatLocalDataChange(state.readiness.lastLocalDataChangeAt)}.`}
            style={styles.settingsSection}
          >
            <Badge label="Ready offline" palette={palette} emphasized />
            <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
              Local SQLite · no network required
            </Text>
            <Text style={[styles.smallText, { color: palette.muted }]}>
              Schema version {state.readiness.schemaVersion} · integrity check
              passed
            </Text>
            <Text style={[styles.smallText, { color: palette.muted }]}>
              Last local data change:{' '}
              {formatLocalDataChange(state.readiness.lastLocalDataChangeAt)}
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.settingsCard,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, { color: palette.text }]}
        >
          Export and restore
        </Text>
        <Text
          accessibilityRole="alert"
          style={[styles.bodyTextStrong, { color: palette.warning }]}
        >
          {PORTABLE_EXPORT_WARNING}
        </Text>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          Export opens the system share sheet. Restore accepts the JSON text
          from a previous Vibe Ledger export and validates it before replacing
          local data.
        </Text>
        <View style={styles.settingsActions}>
          <Pressable
            accessibilityLabel="Export local financial data"
            accessibilityRole="button"
            accessibilityState={{
              busy: busyAction === 'EXPORT',
              disabled: busy,
            }}
            disabled={busy}
            onPress={confirmExport}
            style={[
              styles.secondaryButton,
              { backgroundColor: palette.accent },
            ]}
            testID="settings-export"
          >
            <Text
              style={[styles.smallButtonText, { color: palette.accentText }]}
            >
              Export
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Restore local data from pasted export"
            accessibilityRole="button"
            accessibilityState={{
              busy: busyAction === 'RESTORE',
              disabled: busy,
            }}
            disabled={busy}
            onPress={() => {
              setError(null);
              setRestoreOpen(true);
            }}
            style={styles.secondaryButton}
            testID="settings-restore"
          >
            <Text style={[styles.smallButtonText, { color: palette.accent }]}>
              Restore
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.settingsCard,
          { backgroundColor: palette.surface, borderColor: palette.breach },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[styles.cardTitle, { color: palette.text }]}
        >
          Delete local data
        </Text>
        <Text style={[styles.bodyText, { color: palette.muted }]}>
          Permanently remove the local ledger. Loading synthetic Demo Data
          afterwards remains a separate, explicit action.
        </Text>
        <Pressable
          accessibilityLabel="Delete all local ledger data"
          accessibilityRole="button"
          accessibilityState={{ busy: busyAction === 'WIPE', disabled: busy }}
          disabled={busy}
          onPress={confirmWipe}
          style={[styles.secondaryButton, { borderColor: palette.breach }]}
          testID="settings-wipe"
        >
          <Text style={[styles.smallButtonText, { color: palette.breach }]}>
            Delete all local data
          </Text>
        </Pressable>
      </View>

      {message === null ? null : (
        <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>
          {message}
        </Text>
      )}
      {error === null ? null : (
        <Text accessibilityRole="alert" style={{ color: palette.breach }}>
          {error}
        </Text>
      )}

      <Modal
        animationType="none"
        onRequestClose={() => setRestoreOpen(false)}
        transparent
        visible={restoreOpen}
      >
        <View style={styles.modalBackdrop}>
          <View
            accessibilityViewIsModal
            style={[
              styles.modalCard,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text
              accessibilityRole="header"
              style={[styles.cardTitle, { color: palette.text }]}
            >
              Paste local data export
            </Text>
            <Text style={[styles.bodyText, { color: palette.warning }]}>
              {PORTABLE_EXPORT_WARNING}
            </Text>
            <TextInput
              accessibilityLabel="Export JSON to restore"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setRestoreText}
              placeholder="Paste the complete exported JSON"
              placeholderTextColor={palette.muted}
              style={[
                styles.restoreInput,
                { borderColor: palette.border, color: palette.text },
              ]}
              testID="settings-restore-input"
              value={restoreText}
            />
            {error === null ? null : (
              <Text accessibilityRole="alert" style={{ color: palette.breach }}>
                {error}
              </Text>
            )}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setRestoreOpen(false)}
                style={styles.secondaryButton}
              >
                <Text
                  style={[styles.smallButtonText, { color: palette.muted }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{
                  busy: busyAction === 'RESTORE',
                  disabled: busy,
                }}
                disabled={busy}
                onPress={confirmRestore}
                style={[styles.modalSave, { backgroundColor: palette.accent }]}
                testID="settings-restore-confirm"
              >
                <Text
                  style={[
                    styles.smallButtonText,
                    { color: palette.accentText },
                  ]}
                >
                  Review restore
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <CoreNavigation
        active="SETTINGS"
        onBreakdown={onOpenBreakdown}
        onHome={onHome}
        onSettings={() => undefined}
        onSubscriptions={onOpenSubscriptions}
        onTrends={onOpenTrends}
        palette={palette}
      />
    </ScrollView>
  );
}

type TrendLoadState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'ERROR' }
  | { readonly status: 'READY'; readonly result: TrendQueryResult };

function MoneyMapScreen({
  budget,
  transactions,
  resolutionTransactions,
  months,
  activeMonth,
  otherCurrencies,
  onSelectMonth,
  onExplore,
  onHome,
  onOpenTrends,
  onOpenSubscriptions,
  onOpenSettings,
  palette,
}: {
  readonly budget: NonNullable<LedgerSnapshot['ledgerMonth']>['budget'];
  readonly transactions: NonNullable<
    LedgerSnapshot['ledgerMonth']
  >['transactions'];
  readonly resolutionTransactions: NonNullable<
    LedgerSnapshot['ledgerMonth']
  >['resolutionTransactions'];
  readonly months: readonly string[];
  readonly activeMonth: string;
  readonly otherCurrencies: readonly string[];
  readonly onSelectMonth: (month: string) => void;
  readonly onExplore: (filter: LedgerQuery) => void;
  readonly onHome: () => void;
  readonly onOpenTrends: () => void;
  readonly onOpenSubscriptions: () => void;
  readonly onOpenSettings: () => void;
  readonly palette: Palette;
}) {
  const [mode, setMode] = useState<MoneyMapMode>('PLAN');
  const model = useMemo(
    () =>
      createMoneyMapModel(
        mode,
        budget,
        transactions,
        resolutionTransactions,
        otherCurrencies,
      ),
    [budget, mode, otherCurrencies, resolutionTransactions, transactions],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      testID="money-map-screen"
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.demoPill, { color: palette.warning }]}>
            EXPERIMENTAL · NOT A PRIMARY DESTINATION
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.screenTitle, { color: palette.text }]}
          >
            Money Map
          </Text>
          <Text style={[styles.bodyText, { color: palette.muted }]}>
            A proportional view of stored targets and canonical budget activity.
            It does not create new accounting meaning.
          </Text>
        </View>
      </View>

      <View style={styles.monthRow}>
        {months.map((month) => (
          <Pressable
            key={month}
            accessibilityRole="button"
            accessibilityLabel={`Show ${formatTrendMonth(month)}`}
            accessibilityState={{ selected: month === activeMonth }}
            onPress={() => onSelectMonth(month)}
            style={[
              styles.monthButton,
              {
                backgroundColor:
                  month === activeMonth ? palette.accent : palette.surfaceMuted,
              },
            ]}
            testID={`money-map-month-${month}`}
          >
            <Text
              style={{
                color:
                  month === activeMonth ? palette.accentText : palette.text,
                fontWeight: '700',
              }}
            >
              {month}
            </Text>
          </Pressable>
        ))}
      </View>

      <View
        accessibilityLabel="Money Map view"
        style={[
          styles.moneyMapControls,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <View style={styles.trendChipRow}>
          <FilterButton
            active={mode === 'PLAN'}
            label="Plan"
            onPress={() => setMode('PLAN')}
            palette={palette}
            testID="money-map-plan"
          />
          <FilterButton
            active={mode === 'ACTUAL'}
            label="Actual"
            onPress={() => setMode('ACTUAL')}
            palette={palette}
            testID="money-map-actual"
          />
        </View>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          {model.currency} only · no FX mixing · one full source width equals
          the {model.budgetBaseLabel} budget base.
        </Text>
      </View>

      {model.otherCurrencies.length === 0 ? null : (
        <View
          accessibilityRole="alert"
          style={[
            styles.notice,
            {
              backgroundColor: palette.surfaceMuted,
              borderColor: palette.border,
            },
          ]}
          testID="money-map-currency-partition"
        >
          <Text style={[styles.bodyText, { color: palette.text }]}>
            {model.otherCurrencies.join(', ')} activity is stored separately and
            is not added to this {model.currency} map.
          </Text>
        </View>
      )}

      <View
        style={[
          styles.moneyMapPanel,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID={`money-map-${mode.toLowerCase()}-flow`}
      >
        <View style={styles.moneyMapSourceRow}>
          <View
            style={[
              styles.moneyMapSource,
              { backgroundColor: palette.surfaceMuted },
            ]}
          >
            <Text style={[styles.label, { color: palette.muted }]}>
              BUDGET BASE
            </Text>
            <Text style={[styles.cardAmount, { color: palette.text }]}>
              {model.budgetBaseLabel}
            </Text>
          </View>
        </View>
        {model.branches.map((branch) => {
          const identity = categoryColor(branch.key, palette);
          const breached =
            mode === 'ACTUAL' && branch.overflowBasisPoints > 10_000;
          const offset = mode === 'ACTUAL' && branch.amountMinor < 0;
          return (
            <View
              key={branch.key}
              style={[
                styles.moneyMapBranch,
                { borderTopColor: palette.border },
              ]}
              testID={`money-map-branch-${branch.key.toLowerCase()}`}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${branch.label}, ${branch.measureLabel}, ${branch.amountLabel}, target ${branch.targetLabel}, ${branch.statusLabel}. Open exact month Breakdown.`}
                onPress={() => onExplore(branch.drillDown)}
                style={styles.moneyMapBranchHeader}
                testID={`money-map-node-${branch.key.toLowerCase()}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: identity }]}>
                    {branch.label}
                  </Text>
                  <Text style={[styles.smallText, { color: palette.muted }]}>
                    {branch.measureLabel} · {branch.statusLabel}
                  </Text>
                </View>
                <View style={styles.breakdownAmount}>
                  <Text
                    style={[
                      styles.cardAmount,
                      {
                        color: breached
                          ? palette.breach
                          : offset
                            ? palette.warning
                            : palette.text,
                      },
                    ]}
                  >
                    {branch.amountLabel}
                  </Text>
                  <Text style={[styles.smallText, { color: palette.muted }]}>
                    target {branch.targetLabel}
                  </Text>
                </View>
              </Pressable>
              <ScrollView
                accessibilityLabel={`${branch.label} proportional stream`}
                horizontal
                showsHorizontalScrollIndicator={breached}
              >
                <View
                  style={[
                    styles.moneyMapFlow,
                    {
                      width: Math.max(2, branch.width),
                      backgroundColor: breached
                        ? palette.breach
                        : offset
                          ? palette.warning
                          : identity,
                    },
                  ]}
                  testID={`money-map-stream-${branch.key.toLowerCase()}`}
                />
              </ScrollView>
              {mode === 'PLAN' ? (
                <Text style={[styles.smallText, { color: palette.muted }]}>
                  No category targets are stored, so this plan stream is not
                  split into invented subcategory budgets.
                </Text>
              ) : (
                <View style={styles.moneyMapCategories}>
                  {branch.categories.length === 0 ? (
                    <Text style={[styles.smallText, { color: palette.muted }]}>
                      No included category activity.
                    </Text>
                  ) : (
                    branch.categories.map((category) => (
                      <Pressable
                        key={category.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${category.label}, ${category.amountLabel}, ${
                          category.direction === 'OFFSET'
                            ? 'refund or reimbursement offset'
                            : category.hasOffset
                              ? 'net activity after refund or reimbursement offset'
                              : category.direction === 'ZERO'
                                ? 'net zero category activity'
                                : branch.measureLabel
                        }. Open exact month category Breakdown.`}
                        onPress={() => onExplore(category.drillDown)}
                        style={styles.moneyMapCategoryRow}
                        testID={`money-map-category-${category.id.replace(':', '-')}`}
                      >
                        <View style={styles.moneyMapCategoryHeader}>
                          <View style={styles.moneyMapCategoryLabel}>
                            <Text
                              style={[
                                styles.bodyTextStrong,
                                { color: palette.text },
                              ]}
                            >
                              {category.direction === 'OFFSET'
                                ? '← '
                                : category.direction === 'ZERO'
                                  ? '↔ '
                                  : '→ '}
                              {category.label}
                            </Text>
                            <Text
                              style={[
                                styles.smallText,
                                {
                                  color:
                                    category.direction === 'OFFSET'
                                      ? palette.warning
                                      : palette.muted,
                                },
                              ]}
                            >
                              {category.direction === 'OFFSET'
                                ? 'Refund / reimbursement offset'
                                : category.hasOffset
                                  ? 'Net after refund / reimbursement offset'
                                  : category.direction === 'ZERO'
                                    ? 'Net zero category activity'
                                    : branch.measureLabel}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.bodyTextStrong,
                              { color: palette.text },
                            ]}
                          >
                            {category.amountLabel}
                          </Text>
                        </View>
                        <ScrollView
                          horizontal
                          importantForAccessibility="no-hide-descendants"
                          pointerEvents="none"
                          showsHorizontalScrollIndicator={false}
                        >
                          <View
                            style={[
                              styles.moneyMapCategoryFlow,
                              {
                                width: Math.max(2, category.width),
                                backgroundColor:
                                  category.direction === 'OFFSET'
                                    ? palette.warning
                                    : category.direction === 'ZERO'
                                      ? palette.muted
                                      : identity,
                              },
                            ]}
                          />
                        </ScrollView>
                      </Pressable>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View
        style={[
          styles.moneyMapNet,
          { backgroundColor: palette.surface, borderColor: palette.warning },
        ]}
        testID="money-map-net-savings"
      >
        <View>
          <Text style={[styles.label, { color: palette.warning }]}>
            SEPARATE METRIC
          </Text>
          <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
            Net savings movement
          </Text>
        </View>
        <Text style={[styles.cardAmount, { color: palette.text }]}>
          {model.netSavingsMovementLabel}
        </Text>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          Contributions minus withdrawals. Never merged into the Saving
          contribution stream.
        </Text>
      </View>

      <View
        accessibilityLabel="Money Map exact values table"
        style={[
          styles.moneyMapTable,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="money-map-text-alternative"
      >
        <Text style={[styles.sectionTitle, { color: palette.text }]}>
          Exact values
        </Text>
        {model.accessibilityRows.map((row, index) => (
          <Text
            key={`${index}:${row}`}
            style={[
              styles.moneyMapTableRow,
              { color: palette.text, borderTopColor: palette.border },
            ]}
          >
            {row}
          </Text>
        ))}
      </View>

      <CoreNavigation
        active="NONE"
        onBreakdown={() => onExplore(monthQuery(budget.monthKey))}
        onHome={onHome}
        onSubscriptions={onOpenSubscriptions}
        onSettings={onOpenSettings}
        onTrends={onOpenTrends}
        palette={palette}
      />
    </ScrollView>
  );
}

function TrendsScreen({
  activeMonth,
  currency,
  database,
  onExplore,
  onHome,
  onOpenSubscriptions,
  onOpenSettings,
  palette,
}: {
  readonly activeMonth: string;
  readonly currency: string;
  readonly database: Database;
  readonly onExplore: (filter: LedgerQuery) => void;
  readonly onHome: () => void;
  readonly onOpenSubscriptions: () => void;
  readonly onOpenSettings: () => void;
  readonly palette: Palette;
}) {
  const [selection, setSelection] = useState<TrendSelection>({
    kind: 'OVERALL',
  });
  const [period, setPeriod] = useState<TrendPeriod | 'CUSTOM'>(12);
  const [request, setRequest] = useState<TrendRequest>(() =>
    periodRequest(activeMonth, 12, { kind: 'OVERALL' }),
  );
  const [customStart, setCustomStart] = useState(request.startMonth);
  const [customEnd, setCustomEnd] = useState(request.endMonth);
  const [customError, setCustomError] = useState<string | null>(null);
  const [state, setState] = useState<TrendLoadState>({ status: 'LOADING' });
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      queryLedgerTrends(database, request, currency),
      listCategories(database),
    ]).then(
      ([result, nextCategories]) => {
        if (active) {
          setState({ status: 'READY', result });
          setCategories(nextCategories);
        }
      },
      () => {
        if (active) {
          setState({ status: 'ERROR' });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [currency, database, request, retryCount]);

  const applySelection = useCallback((nextSelection: TrendSelection) => {
    setSelection(nextSelection);
    setSelectedBarId(null);
    setState({ status: 'LOADING' });
    setRequest((current) => ({ ...current, selection: nextSelection }));
  }, []);
  const setPreset = useCallback(
    (nextPeriod: TrendPeriod) => {
      setPeriod(nextPeriod);
      setCustomError(null);
      setSelectedBarId(null);
      setState({ status: 'LOADING' });
      const next = periodRequest(activeMonth, nextPeriod, selection);
      setCustomStart(next.startMonth);
      setCustomEnd(next.endMonth);
      setRequest(next);
    },
    [activeMonth, selection],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      testID="trends-screen"
    >
      <Text style={[styles.demoPill, { color: palette.accent }]}>
        TRENDS · CANONICAL LEDGER
      </Text>
      <Text
        accessibilityRole="header"
        style={[styles.screenTitle, { color: palette.text }]}
      >
        Trends
      </Text>
      <Text style={[styles.bodyText, { color: palette.muted }]}>
        Living and Fun show included spending. Saving shows contributions. Net
        savings movement remains separate.
      </Text>

      <View
        style={[
          styles.trendControls,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.label, { color: palette.muted }]}>PERIOD</Text>
        <View style={styles.trendChipRow}>
          {([3, 6, 12, 24] as const).map((item) => (
            <FilterButton
              key={item}
              active={period === item}
              label={`${item}m`}
              onPress={() => setPreset(item)}
              palette={palette}
              testID={`trend-period-${item}`}
            />
          ))}
          <FilterButton
            active={period === 'CUSTOM'}
            label="Custom"
            onPress={() => setPeriod('CUSTOM')}
            palette={palette}
            testID="trend-period-custom"
          />
        </View>
        {period === 'CUSTOM' ? (
          <View style={styles.customPeriodRow}>
            <TextInput
              accessibilityLabel="Custom trend start month"
              autoCapitalize="none"
              onChangeText={setCustomStart}
              placeholder="YYYY-MM"
              placeholderTextColor={palette.muted}
              style={[
                styles.monthInput,
                { borderColor: palette.border, color: palette.text },
              ]}
              testID="trend-custom-start"
              value={customStart}
            />
            <Text style={{ color: palette.muted }}>to</Text>
            <TextInput
              accessibilityLabel="Custom trend end month"
              autoCapitalize="none"
              onChangeText={setCustomEnd}
              placeholder="YYYY-MM"
              placeholderTextColor={palette.muted}
              style={[
                styles.monthInput,
                { borderColor: palette.border, color: palette.text },
              ]}
              testID="trend-custom-end"
              value={customEnd}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                try {
                  enumerateMonths(customStart, customEnd);
                } catch {
                  setCustomError(
                    'Use valid YYYY-MM months in order. Custom periods are limited to 120 months.',
                  );
                  return;
                }
                setCustomError(null);
                setSelectedBarId(null);
                setState({ status: 'LOADING' });
                setRequest({
                  startMonth: customStart,
                  endMonth: customEnd,
                  selection,
                });
              }}
              style={[styles.applyButton, { backgroundColor: palette.accent }]}
              testID="trend-custom-apply"
            >
              <Text style={{ color: palette.accentText, fontWeight: '800' }}>
                Apply
              </Text>
            </Pressable>
          </View>
        ) : null}
        {customError === null ? null : (
          <Text accessibilityRole="alert" style={{ color: palette.breach }}>
            {customError}
          </Text>
        )}

        <Text style={[styles.label, { color: palette.muted }]}>SERIES</Text>
        <View style={styles.trendChipRow}>
          <FilterButton
            active={selection.kind === 'OVERALL'}
            label="Overall"
            onPress={() => applySelection({ kind: 'OVERALL' })}
            palette={palette}
            testID="trend-series-overall"
          />
          {SUPER_CATEGORY_KEYS.map((key) => (
            <FilterButton
              key={key}
              active={
                selection.kind === 'SUPER_CATEGORIES' &&
                selection.superCategories.includes(key)
              }
              label={trendSuperLabel(key)}
              onPress={() => {
                const selected =
                  selection.kind === 'SUPER_CATEGORIES'
                    ? selection.superCategories
                    : [];
                const next = selected.includes(key)
                  ? selected.filter((item) => item !== key)
                  : [...selected, key];
                applySelection({
                  kind: 'SUPER_CATEGORIES',
                  superCategories: next.length === 0 ? [key] : next,
                });
              }}
              palette={palette}
              testID={`trend-series-${key.toLowerCase()}`}
            />
          ))}
        </View>

        <Text style={[styles.label, { color: palette.muted }]}>CATEGORY</Text>
        <ScrollView
          contentContainerStyle={styles.trendChipRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {categories.map((category) => (
            <FilterButton
              key={category.id}
              active={
                selection.kind === 'CATEGORY' &&
                selection.categoryId === category.id
              }
              label={category.name}
              onPress={() =>
                applySelection({
                  kind: 'CATEGORY',
                  categoryId: category.id,
                  categoryName: category.name,
                  superCategory: category.superCategory,
                })
              }
              palette={palette}
              testID={`trend-category-${category.id.replace(':', '-')}`}
            />
          ))}
        </ScrollView>
      </View>

      {state.status === 'LOADING' ? (
        <View
          accessibilityLabel={asyncStateLabel('Trends', 'LOADING')}
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy: true }}
          style={styles.trendLoading}
        >
          <ActivityIndicator
            accessibilityElementsHidden
            color={palette.accent}
          />
          <Text style={[styles.bodyText, { color: palette.muted }]}>
            Calculating local trends…
          </Text>
        </View>
      ) : state.status === 'ERROR' ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.notice,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.bodyText, { color: palette.text }]}>
            Trends could not be calculated from the local ledger.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setState({ status: 'LOADING' });
              setRetryCount((count) => count + 1);
            }}
            style={styles.secondaryButton}
            testID="trends-retry"
          >
            <Text style={[styles.smallButtonText, { color: palette.accent }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <TrendResults
          model={state.result}
          onExplore={onExplore}
          onSelectBar={setSelectedBarId}
          palette={palette}
          selectedBarId={selectedBarId}
        />
      )}

      <CoreNavigation
        active="TRENDS"
        onBreakdown={() => onExplore(monthQuery(activeMonth))}
        onHome={onHome}
        onTrends={() => undefined}
        onSubscriptions={onOpenSubscriptions}
        onSettings={onOpenSettings}
        palette={palette}
      />
    </ScrollView>
  );
}

function TrendResults({
  model,
  onExplore,
  onSelectBar,
  palette,
  selectedBarId,
}: {
  readonly model: TrendModel;
  readonly onExplore: (filter: LedgerQuery) => void;
  readonly onSelectBar: (barId: string) => void;
  readonly palette: Palette;
  readonly selectedBarId: string | null;
}) {
  const layout = useMemo(() => createTrendChartLayout(model), [model]);
  const allBars = model.months.flatMap(({ bars }) => bars);
  const selectedBar =
    allBars.find(({ id }) => id === selectedBarId) ??
    model.months.at(-1)?.bars[0] ??
    null;
  const selectedMonth =
    selectedBar === null
      ? (model.months.at(-1) ?? null)
      : (model.months.find(({ month }) => month === selectedBar.month) ?? null);
  const hasActivity = allBars.some(
    ({ actualMinor, targetMinor }) => actualMinor !== 0 || targetMinor !== null,
  );

  return (
    <>
      {model.otherCurrencies.length === 0 ? null : (
        <View
          accessibilityRole="alert"
          style={[
            styles.notice,
            {
              backgroundColor: palette.surfaceMuted,
              borderColor: palette.border,
            },
          ]}
          testID="trend-currency-partition"
        >
          <Text style={[styles.bodyText, { color: palette.text }]}>
            Showing {model.currency} only. {model.otherCurrencies.join(', ')}{' '}
            activity is kept in separate currency partitions and is not summed.
          </Text>
        </View>
      )}
      <View
        style={[
          styles.trendChartPanel,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="trend-chart"
      >
        <View style={styles.trendLegend}>
          <Text style={[styles.smallText, { color: palette.muted }]}>
            Solid stacks = actual · rule = stored monthly target · below axis =
            refunds/reimbursements
          </Text>
        </View>
        {!hasActivity ? (
          <Text
            style={[styles.bodyText, { color: palette.muted }]}
            testID="trend-empty"
          >
            No activity or stored targets in this period.
          </Text>
        ) : null}
        <ScrollView
          accessibilityLabel="Monthly trend chart"
          horizontal
          showsHorizontalScrollIndicator
        >
          <View style={styles.trendMonthsRow}>
            {model.months.map((month) => (
              <View
                key={month.month}
                style={styles.trendMonthGroup}
                testID={`trend-month-${month.month}`}
              >
                <View style={styles.trendBarsRow}>
                  {month.bars.map((bar) => (
                    <TrendBarColumn
                      key={bar.id}
                      bar={bar}
                      currency={model.currency}
                      layout={layout.bars.get(bar.id)}
                      onExplore={onExplore}
                      onSelect={() => onSelectBar(bar.id)}
                      palette={palette}
                    />
                  ))}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${formatTrendMonth(month.month)}. Open month Breakdown.`}
                  onPress={() => onExplore(month.drillDown)}
                  style={styles.trendMonthButton}
                  testID={`trend-month-drilldown-${month.month}`}
                >
                  <Text
                    style={[styles.trendMonthLabel, { color: palette.text }]}
                  >
                    {formatTrendMonthShort(month.month)}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      {selectedBar === null || selectedMonth === null ? null : (
        <TrendDetailPanel
          bar={selectedBar}
          currency={model.currency}
          netSavingsMovementMinor={selectedMonth.netSavingsMovementMinor}
          onExplore={onExplore}
          palette={palette}
        />
      )}
    </>
  );
}

function TrendBarColumn({
  bar,
  currency,
  layout,
  onExplore,
  onSelect,
  palette,
}: {
  readonly bar: TrendBar;
  readonly currency: string;
  readonly layout: ReturnType<
    typeof createTrendChartLayout
  >['bars'] extends ReadonlyMap<string, infer Layout>
    ? Layout | undefined
    : never;
  readonly onExplore: (filter: LedgerQuery) => void;
  readonly onSelect: () => void;
  readonly palette: Palette;
}) {
  const positiveSegments = bar.segments.filter(
    ({ amountMinor }) => amountMinor > 0,
  );
  const negativeSegments = bar.segments.filter(
    ({ amountMinor }) => amountMinor < 0,
  );
  const targetHeight = layout?.targetHeight ?? null;
  return (
    <View
      accessibilityLabel={`${bar.label}, ${formatMoney(money(bar.actualMinor, currency), 'en-GB')} actual`}
      style={styles.trendBarColumn}
      testID={`trend-bar-${bar.id}`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show ${bar.month} ${bar.label} detail`}
        onPress={onSelect}
        style={styles.trendBarValueButton}
        testID={`trend-detail-${bar.id}`}
      >
        <Text
          numberOfLines={2}
          style={[styles.trendBarValue, { color: palette.text }]}
        >
          {compactMinor(bar.actualMinor, currency)}
        </Text>
      </Pressable>
      <View style={styles.trendPositiveArea}>
        {targetHeight === null ? null : (
          <View
            pointerEvents="none"
            style={[
              styles.trendTargetRule,
              {
                backgroundColor: palette.text,
                bottom: Math.max(0, targetHeight),
              },
            ]}
            testID={`trend-target-${bar.id}`}
          />
        )}
        <View style={styles.trendPositiveStack}>
          {positiveSegments.map((segment, index) => {
            const segmentLayout = layout?.segments.find(
              ({ id }) => id === segment.id,
            );
            return (
              <Pressable
                key={segment.id}
                accessibilityRole="button"
                accessibilityLabel={`${bar.month} ${segment.label}, ${compactMinor(segment.amountMinor, currency)}, ${segment.transactionCount} matching transactions. Open Breakdown.`}
                hitSlop={24}
                onPress={() => {
                  onSelect();
                  onExplore(segment.drillDown);
                }}
                style={[
                  styles.trendSegment,
                  {
                    backgroundColor: trendSegmentColor(
                      bar.superCategory,
                      index,
                      palette,
                    ),
                    borderColor: palette.background,
                    height: Math.max(2, segmentLayout?.height ?? 0),
                  },
                ]}
                testID={`trend-segment-${bar.month}-${segment.id.replace(':', '-')}`}
              />
            );
          })}
          {positiveSegments.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${bar.month} ${bar.label}, zero actual. Open Breakdown.`}
              onPress={() => {
                onSelect();
                onExplore(bar.drillDown);
              }}
              style={[
                styles.trendZeroMarker,
                { backgroundColor: palette.border },
              ]}
              testID={`trend-zero-${bar.id}`}
            />
          ) : null}
        </View>
      </View>
      <View style={[styles.trendAxis, { backgroundColor: palette.border }]} />
      <View style={styles.trendNegativeArea}>
        {negativeSegments.map((segment, index) => {
          const segmentLayout = layout?.segments.find(
            ({ id }) => id === segment.id,
          );
          return (
            <Pressable
              key={segment.id}
              accessibilityRole="button"
              accessibilityLabel={`${bar.month} ${segment.label}, negative ${compactMinor(Math.abs(segment.amountMinor), currency)}. Open Breakdown.`}
              hitSlop={8}
              onPress={() => {
                onSelect();
                onExplore(segment.drillDown);
              }}
              style={[
                styles.trendNegativeSegment,
                {
                  backgroundColor: trendSegmentColor(
                    bar.superCategory,
                    index,
                    palette,
                  ),
                  height: Math.max(2, segmentLayout?.height ?? 0),
                },
              ]}
              testID={`trend-negative-${bar.month}-${segment.id.replace(':', '-')}`}
            />
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${bar.month} ${bar.label} Breakdown`}
        onPress={() => {
          onSelect();
          onExplore(bar.drillDown);
        }}
        style={styles.trendBarLabelButton}
        testID={`trend-bar-drilldown-${bar.id}`}
      >
        <Text
          numberOfLines={2}
          style={[
            styles.trendBarLabel,
            { color: categoryColor(bar.superCategory, palette) },
          ]}
        >
          {bar.label}
        </Text>
      </Pressable>
      <Text style={[styles.trendTargetLabel, { color: palette.muted }]}>
        {bar.targetMinor === null
          ? 'No category target'
          : bar.targetMinor === 0
            ? 'Target £0'
            : `T ${compactMinor(bar.targetMinor, currency)}`}
      </Text>
    </View>
  );
}

function TrendDetailPanel({
  bar,
  currency,
  netSavingsMovementMinor,
  onExplore,
  palette,
}: {
  readonly bar: TrendBar;
  readonly currency: string;
  readonly netSavingsMovementMinor: number;
  readonly onExplore: (filter: LedgerQuery) => void;
  readonly palette: Palette;
}) {
  const difference =
    bar.targetMinor === null ? null : bar.targetMinor - bar.actualMinor;
  const breached = difference !== null && difference < 0;
  return (
    <View
      style={[
        styles.trendDetail,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      testID="trend-detail-panel"
    >
      <Text style={[styles.sectionKicker, { color: palette.accent }]}>
        {formatTrendMonth(bar.month).toUpperCase()} · {bar.label.toUpperCase()}
      </Text>
      <View style={styles.trendDetailMetrics}>
        <SummaryMetric
          label={
            bar.measure === 'SAVING_CONTRIBUTIONS' ? 'CONTRIBUTED' : 'ACTUAL'
          }
          palette={palette}
          value={formatMoney(money(bar.actualMinor, currency), 'en-GB')}
        />
        <SummaryMetric
          label="STORED TARGET"
          palette={palette}
          value={
            bar.targetMinor === null
              ? 'Not applicable'
              : formatMoney(money(bar.targetMinor, currency), 'en-GB')
          }
        />
      </View>
      <Text
        style={[
          styles.bodyTextStrong,
          { color: breached ? palette.breach : palette.text },
        ]}
      >
        {difference === null
          ? 'Categories do not have a separate target.'
          : difference < 0
            ? `${formatMoney(money(-difference, currency), 'en-GB')} over`
            : difference === 0
              ? 'Exactly on target'
              : `${formatMoney(money(difference, currency), 'en-GB')} ${bar.superCategory === 'SAVING' ? 'to go' : 'under'}`}
      </Text>
      <Text style={[styles.smallText, { color: palette.muted }]}>
        {bar.transactionCount} matching transaction
        {bar.transactionCount === 1 ? '' : 's'} ·{' '}
        {bar.measure === 'SAVING_CONTRIBUTIONS'
          ? 'Saving contributions'
          : 'Included spending'}
      </Text>
      {bar.superCategory === 'SAVING' ? (
        <Text style={[styles.bodyText, { color: palette.warning }]}>
          Net savings movement:{' '}
          {formatMoney(money(netSavingsMovementMinor, currency), 'en-GB')}
        </Text>
      ) : null}
      <Text style={[styles.label, { color: palette.muted }]}>COMPOSITION</Text>
      {bar.segments.length === 0 ? (
        <Text style={[styles.bodyText, { color: palette.muted }]}>
          No matching category activity.
        </Text>
      ) : (
        bar.segments.map((segment) => (
          <Pressable
            key={segment.id}
            accessibilityRole="button"
            onPress={() => onExplore(segment.drillDown)}
            style={[
              styles.trendCompositionRow,
              { borderBottomColor: palette.border },
            ]}
            testID={`trend-composition-${segment.id.replace(':', '-')}`}
          >
            <View>
              <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
                {segment.label}
              </Text>
              <Text style={[styles.smallText, { color: palette.muted }]}>
                {segment.transactionCount} transaction
                {segment.transactionCount === 1 ? '' : 's'}
              </Text>
            </View>
            <Text
              style={[
                styles.bodyTextStrong,
                {
                  color:
                    segment.amountMinor < 0 ? palette.warning : palette.text,
                },
              ]}
            >
              {formatMoney(money(segment.amountMinor, currency), 'en-GB')}
            </Text>
          </Pressable>
        ))
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => onExplore(bar.drillDown)}
        style={[styles.primaryButton, { backgroundColor: palette.accent }]}
        testID="trend-view-transactions"
      >
        <Text style={[styles.primaryButtonText, { color: palette.accentText }]}>
          View {bar.transactionCount} matching transaction
          {bar.transactionCount === 1 ? '' : 's'}
        </Text>
      </Pressable>
    </View>
  );
}

function FilterButton({
  active,
  label,
  onPress,
  palette,
  testID,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
  readonly palette: Palette;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.trendChip,
        {
          backgroundColor: active ? palette.accent : palette.surfaceMuted,
          borderColor: active ? palette.accent : palette.border,
        },
      ]}
      testID={testID}
    >
      <Text
        style={{
          color: active ? palette.accentText : palette.text,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ExplorerScreen({
  backDestination,
  database,
  palette,
  filter,
  currency,
  queryResult,
  unrecognizedTokens,
  onChangeFilter,
  onSearch,
  onDataChanged,
  onOpenTrends,
  onOpenSubscriptions,
  onOpenSettings,
  onBack,
}: {
  readonly backDestination:
    'HOME' | 'TRENDS' | 'SUBSCRIPTIONS' | 'MONEY_MAP' | 'SETTINGS';
  readonly database: Database;
  readonly palette: Palette;
  readonly filter: ExplorerFilter;
  readonly currency: string;
  readonly queryResult: LedgerQueryResult;
  readonly unrecognizedTokens: readonly string[];
  readonly onChangeFilter: (filter: ExplorerFilter) => void;
  readonly onSearch: (parsed: ParsedLedgerSearch) => void;
  readonly onDataChanged: () => Promise<void>;
  readonly onOpenTrends: () => void;
  readonly onOpenSubscriptions: () => void;
  readonly onOpenSettings: () => void;
  readonly onBack: () => void;
}) {
  const [searchText, setSearchText] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [rules, setRules] = useState<readonly ClassificationRule[]>([]);
  const [selectedTransaction, setSelectedTransaction] =
    useState<ClassifiedTransaction | null>(null);
  const [selectedRule, setSelectedRule] = useState<ClassificationRule | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const mutationCounter = useRef(0);
  const nextMutation = useCallback(() => {
    mutationCounter.current += 1;
    const timestamp = new Date(
      Date.parse('2026-09-24T16:42:32.000Z') + mutationCounter.current * 1_000,
    ).toISOString();
    return { timestamp, suffix: String(mutationCounter.current) };
  }, []);
  const refreshRules = useCallback(async () => {
    setRules(await listMerchantRules(database));
  }, [database]);
  useEffect(() => {
    let active = true;
    Promise.all([listCategories(database), listMerchantRules(database)]).then(
      ([nextCategories, nextRules]) => {
        if (active) {
          setCategories(nextCategories);
          setRules(nextRules);
        }
      },
      () => {
        if (active) {
          setActionError('Correction controls could not be loaded.');
        }
      },
    );
    return () => {
      active = false;
    };
  }, [database]);
  const viewModel = useMemo(
    () =>
      createExplorerViewModel(
        queryResult.matches,
        queryResult.resolutionTransactions,
        filter,
        currency,
      ),
    [currency, filter, queryResult],
  );
  const merchants = useMemo(
    () => [
      ...new Set(
        queryResult.resolutionTransactions.map(
          ({ raw }) => raw.merchantName ?? raw.description,
        ),
      ),
    ],
    [queryResult.resolutionTransactions],
  );
  const categorizedIds = new Set(
    viewModel.superCategories.flatMap((superCategory) =>
      superCategory.categories.flatMap((category) =>
        category.transactions.map((transaction) => transaction.id),
      ),
    ),
  );
  const otherTransactions = viewModel.transactions.filter(
    ({ id }) => !categorizedIds.has(id),
  );
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      testID="explorer-screen"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Back to ${
          backDestination === 'TRENDS'
            ? 'Trends'
            : backDestination === 'SUBSCRIPTIONS'
              ? 'Subscriptions'
              : backDestination === 'MONEY_MAP'
                ? 'Money Map'
                : backDestination === 'SETTINGS'
                  ? 'Settings'
                  : 'Home'
        }`}
        onPress={onBack}
        style={styles.backButton}
        testID="explorer-back"
      >
        <Text style={[styles.textButtonLabel, { color: palette.accent }]}>
          ←{' '}
          {backDestination === 'TRENDS'
            ? 'Trends'
            : backDestination === 'SUBSCRIPTIONS'
              ? 'Subscriptions'
              : backDestination === 'MONEY_MAP'
                ? 'Money Map'
                : backDestination === 'SETTINGS'
                  ? 'Settings'
                  : 'Home'}
        </Text>
      </Pressable>
      <Text style={[styles.demoPill, { color: palette.accent }]}>
        BREAKDOWN · LOCAL CORRECTIONS
      </Text>
      <Text
        accessibilityRole="header"
        style={[styles.screenTitle, { color: palette.text }]}
      >
        {viewModel.title}
      </Text>
      <Text style={[styles.bodyText, { color: palette.muted }]}>
        {viewModel.periodLabel} · {viewModel.transactionCountLabel}
      </Text>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search local transactions"
          accessibilityHint="Enter a merchant, category, date, or amount filter"
          onChangeText={setSearchText}
          onSubmitEditing={() => {
            try {
              const parsed = parseLedgerSearch(
                searchText,
                { categories, merchants },
                '2026-09-24',
              );
              setActionError(null);
              onSearch(parsed);
            } catch {
              setActionError('The search could not be interpreted safely.');
            }
          }}
          placeholder="fun over £50 last 6 months"
          placeholderTextColor={palette.muted}
          returnKeyType="search"
          style={[
            styles.searchInput,
            {
              borderColor: palette.border,
              color: palette.text,
              backgroundColor: palette.surface,
            },
          ]}
          testID="explorer-search"
          value={searchText}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search transactions"
          onPress={() => {
            try {
              const parsed = parseLedgerSearch(
                searchText,
                { categories, merchants },
                '2026-09-24',
              );
              setActionError(null);
              onSearch(parsed);
            } catch {
              setActionError('The search could not be interpreted safely.');
            }
          }}
          style={[styles.searchButton, { backgroundColor: palette.accent }]}
          testID="explorer-search-submit"
        >
          <Text style={[styles.smallButtonText, { color: palette.accentText }]}>
            Search
          </Text>
        </Pressable>
      </View>
      {unrecognizedTokens.length > 0 ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.notice,
            {
              backgroundColor: palette.surfaceMuted,
              borderColor: palette.border,
            },
          ]}
          testID="search-unrecognized"
        >
          <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
            Not understood
          </Text>
          <Text style={[styles.smallText, { color: palette.muted }]}>
            {unrecognizedTokens.join(' · ')}
          </Text>
        </View>
      ) : null}
      <QueryChips
        filter={filter}
        palette={palette}
        onRemove={(kind) => onChangeFilter(removeFilter(filter, kind))}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: filtersOpen }}
        onPress={() => setFiltersOpen((open) => !open)}
        style={[
          styles.secondaryButton,
          { backgroundColor: palette.surfaceMuted, alignSelf: 'flex-start' },
        ]}
        testID="structured-filters-toggle"
      >
        <Text style={[styles.smallButtonText, { color: palette.text }]}>
          {filtersOpen ? 'Hide structured filters' : 'Structured filters'}
        </Text>
      </Pressable>
      {filtersOpen ? (
        <StructuredFilters
          categories={categories}
          filter={filter}
          palette={palette}
          onApply={onChangeFilter}
        />
      ) : null}
      {actionError === null ? null : (
        <Text accessibilityRole="alert" style={{ color: palette.warning }}>
          {actionError}
        </Text>
      )}

      <View style={styles.summaryRow}>
        <SummaryMetric
          label="Included spend"
          value={viewModel.includedSpendLabel}
          palette={palette}
        />
        {viewModel.excludedSpendLabel === null ? null : (
          <SummaryMetric
            label="Excluded"
            value={viewModel.excludedSpendLabel}
            palette={palette}
          />
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: palette.text }]}>
        Where it went
      </Text>
      {viewModel.superCategories.length === 0 ? (
        <Text style={[styles.bodyText, { color: palette.muted }]}>
          No category budget effects for this filter.
        </Text>
      ) : (
        viewModel.superCategories.map((superCategory) => (
          <View
            key={superCategory.key}
            style={[
              styles.superCategoryGroup,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.superCategoryHeader}>
              <View style={styles.identityRow}>
                <View
                  accessible
                  accessibilityLabel={asyncStateLabel(
                    'matching transactions',
                    'EMPTY',
                  )}
                  style={[
                    styles.identityDot,
                    {
                      backgroundColor: categoryColor(
                        superCategory.key,
                        palette,
                      ),
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.superCategoryTitle,
                    {
                      color: categoryColor(superCategory.key, palette),
                    },
                  ]}
                >
                  {superCategory.label}
                </Text>
              </View>
              <View style={styles.breakdownAmount}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>
                  {superCategory.amountLabel}
                </Text>
                <Text style={[styles.smallText, { color: palette.muted }]}>
                  {superCategory.percentageLabel} ·{' '}
                  {superCategory.transactionCountLabel}
                </Text>
              </View>
            </View>
            {superCategory.categories.length === 0 ? (
              <Text style={[styles.smallText, { color: palette.muted }]}>
                No matching category activity.
              </Text>
            ) : (
              superCategory.categories.map((item) => (
                <View
                  key={item.key}
                  style={[
                    styles.categoryGroup,
                    { borderTopColor: palette.border },
                  ]}
                >
                  <View style={styles.breakdownHeader}>
                    <View style={styles.breakdownTitleBlock}>
                      <Text
                        style={[styles.bodyTextStrong, { color: palette.text }]}
                      >
                        {item.label}
                      </Text>
                      <View
                        accessibilityLabel={`${item.percentageLabel} of ${superCategory.label}`}
                        style={[
                          styles.categoryTrack,
                          { backgroundColor: palette.surfaceMuted },
                        ]}
                      >
                        <View
                          style={[
                            styles.categoryFill,
                            {
                              width: `${progressPercent(item.percentageLabel)}%`,
                              backgroundColor: categoryColor(
                                superCategory.key,
                                palette,
                              ),
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <View style={styles.breakdownAmount}>
                      <Text
                        style={[styles.bodyTextStrong, { color: palette.text }]}
                      >
                        {item.amountLabel}
                      </Text>
                      <Text
                        style={[styles.smallText, { color: palette.muted }]}
                      >
                        {item.percentageLabel} · {item.transactionCountLabel}
                      </Text>
                    </View>
                  </View>
                  {item.transactions.map((transaction) => (
                    <TransactionTreeRow
                      key={`${item.key}:${transaction.id}`}
                      transaction={transaction}
                      palette={palette}
                      onPress={() =>
                        setSelectedTransaction(
                          queryResult.matches.find(
                            ({ raw }) => raw.id === transaction.id,
                          ) ?? null,
                        )
                      }
                    />
                  ))}
                </View>
              ))
            )}
          </View>
        ))
      )}

      {viewModel.transactions.length === 0 ? (
        <View
          style={[
            styles.notice,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.bodyText, { color: palette.muted }]}>
            No synthetic transactions match this exact filter.
          </Text>
        </View>
      ) : otherTransactions.length === 0 ? null : (
        <View
          style={[
            styles.breakdownGroup,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: palette.text }]}>
            Other activity
          </Text>
          <Text style={[styles.smallText, { color: palette.muted }]}>
            Income, transfers, withdrawals, exclusions, and review items remain
            visible even when they do not affect included spend.
          </Text>
          {otherTransactions.map((transaction) => (
            <TransactionTreeRow
              key={`other:${transaction.id}`}
              transaction={transaction}
              palette={palette}
              onPress={() =>
                setSelectedTransaction(
                  queryResult.matches.find(
                    ({ raw }) => raw.id === transaction.id,
                  ) ?? null,
                )
              }
            />
          ))}
        </View>
      )}
      <View
        style={[
          styles.breakdownGroup,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="merchant-rules"
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>
          Future merchant rules
        </Text>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          Rules apply only to records first seen after creation. Manual
          transaction corrections always win.
        </Text>
        {rules.length === 0 ? (
          <Text style={[styles.smallText, { color: palette.muted }]}>
            Create a rule while saving a transaction correction.
          </Text>
        ) : (
          rules.map((rule) => (
            <View key={rule.id} style={styles.ruleRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit rule for ${rule.matchValue}`}
                onPress={() => setSelectedRule(rule)}
                style={styles.ruleMain}
                testID={`rule-edit-${rule.id}`}
              >
                <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
                  {rule.matchValue}
                </Text>
                <Text style={[styles.smallText, { color: palette.muted }]}>
                  {rule.resultEventType} ·{' '}
                  {rule.resultCategoryId ?? 'No category'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: rule.enabled }}
                onPress={() => {
                  const mutation = nextMutation();
                  setMerchantRuleEnabled(
                    database,
                    rule.id,
                    !rule.enabled,
                    mutation.timestamp,
                  )
                    .then(refreshRules)
                    .catch(() =>
                      setActionError('The merchant rule could not be updated.'),
                    );
                }}
                style={[
                  styles.ruleToggle,
                  {
                    backgroundColor: rule.enabled
                      ? palette.accent
                      : palette.surfaceMuted,
                  },
                ]}
                testID={`rule-toggle-${rule.id}`}
              >
                <Text
                  style={[
                    styles.badgeText,
                    {
                      color: rule.enabled ? palette.accentText : palette.muted,
                    },
                  ]}
                >
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
      {selectedTransaction === null ? null : (
        <TransactionEditor
          categories={categories}
          database={database}
          nextMutation={nextMutation}
          onCancel={() => setSelectedTransaction(null)}
          onPartialFailure={setActionError}
          onSaved={() => {
            setSelectedTransaction(null);
            setActionError(null);
            void Promise.all([onDataChanged(), refreshRules()]).catch(() =>
              setActionError(
                'The correction was saved, but refreshed totals could not be loaded.',
              ),
            );
          }}
          palette={palette}
          transaction={selectedTransaction}
        />
      )}
      {selectedRule === null ? null : (
        <RuleEditor
          categories={categories}
          database={database}
          nextMutation={nextMutation}
          onCancel={() => setSelectedRule(null)}
          onSaved={() => {
            setSelectedRule(null);
            void refreshRules();
          }}
          palette={palette}
          rule={selectedRule}
        />
      )}
      <CoreNavigation
        active="BREAKDOWN"
        palette={palette}
        onHome={onBack}
        onBreakdown={() => undefined}
        onTrends={onOpenTrends}
        onSubscriptions={onOpenSubscriptions}
        onSettings={onOpenSettings}
      />
    </ScrollView>
  );
}

function QueryChips({
  filter,
  palette,
  onRemove,
}: {
  readonly filter: ExplorerFilter;
  readonly palette: Palette;
  readonly onRemove: (kind: FilterKind) => void;
}) {
  const labels = queryChipLabels(filter);
  return (
    <View accessibilityLabel="Active structured filters" style={styles.chipRow}>
      {labels.map(({ kind, label }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label} filter`}
          key={`${kind}:${label}`}
          onPress={() => onRemove(kind)}
          style={[
            styles.filterChip,
            {
              backgroundColor: palette.surfaceMuted,
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: palette.text }]}>
            {label} ×
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

type FilterKind =
  | 'DATE'
  | 'SUBSCRIPTION'
  | 'SUPER_CATEGORY'
  | 'CATEGORY'
  | 'EVENT_TYPE'
  | 'SCOPE'
  | 'MERCHANT'
  | 'AMOUNT'
  | 'WEEKDAY'
  | 'REVIEW';

function queryChipLabels(
  filter: LedgerQuery,
): readonly { readonly kind: FilterKind; readonly label: string }[] {
  return [
    {
      kind: 'DATE',
      label:
        filter.date.kind === 'MONTH'
          ? `Month ${filter.date.month}`
          : filter.date.kind === 'DAY'
            ? `Day ${filter.date.date}`
            : `${filter.date.startDate} to ${filter.date.endDate}`,
    },
    ...(filter.subscriptionId === undefined
      ? []
      : [
          {
            kind: 'SUBSCRIPTION' as const,
            label: 'Linked subscription payments',
          },
        ]),
    ...(filter.subscriptionStatuses === undefined
      ? []
      : filter.subscriptionStatuses.map((status) => ({
          kind: 'SUBSCRIPTION' as const,
          label: `Subscription ${status.toLowerCase().replaceAll('_', ' ')}`,
        }))),
    ...(filter.superCategories ?? []).map((key) => ({
      kind: 'SUPER_CATEGORY' as const,
      label: { LIVING: 'Living', SAVING: 'Saving', FUN: 'Fun' }[key],
    })),
    ...(filter.categoryIds ?? []).map((id) => ({
      kind: 'CATEGORY' as const,
      label: id.replace('category:', '').replaceAll('-', ' '),
    })),
    ...(filter.eventTypes ?? []).map((type) => ({
      kind: 'EVENT_TYPE' as const,
      label: `Type ${type}`,
    })),
    ...(filter.scopes ?? []).map((scope) => ({
      kind: 'SCOPE' as const,
      label: scope === 'INCLUDED' ? 'Included' : 'Excluded',
    })),
    ...(filter.merchant === undefined
      ? []
      : [{ kind: 'MERCHANT' as const, label: filter.merchant }]),
    ...(filter.amount === undefined
      ? []
      : [
          {
            kind: 'AMOUNT' as const,
            label: `${comparatorSymbol(filter.amount.comparator)} ${formatMoney(
              money(filter.amount.thresholdMinor, 'GBP'),
              'en-GB',
            )}`,
          },
        ]),
    ...(filter.weekdays === undefined
      ? []
      : [
          {
            kind: 'WEEKDAY' as const,
            label:
              filter.weekdays.length === 2 &&
              filter.weekdays.includes(0) &&
              filter.weekdays.includes(6)
                ? 'Weekends'
                : 'Selected weekday',
          },
        ]),
    ...(filter.needsReview === true
      ? [{ kind: 'REVIEW' as const, label: 'Needs Review' }]
      : []),
  ];
}

function removeFilter(filter: LedgerQuery, kind: FilterKind): LedgerQuery {
  const next = { ...filter };
  if (kind === 'DATE') {
    return { ...next, date: { kind: 'MONTH', month: '2026-09' } };
  }
  if (kind === 'SUBSCRIPTION') {
    delete next.subscriptionId;
    delete next.subscriptionStatuses;
  } else if (kind === 'SUPER_CATEGORY') {
    delete next.superCategories;
  } else if (kind === 'CATEGORY') {
    delete next.categoryIds;
  } else if (kind === 'EVENT_TYPE') {
    delete next.eventTypes;
  } else if (kind === 'SCOPE') {
    delete next.scopes;
  } else if (kind === 'MERCHANT') {
    delete next.merchant;
  } else if (kind === 'AMOUNT') {
    delete next.amount;
  } else if (kind === 'WEEKDAY') {
    delete next.weekdays;
  } else {
    delete next.needsReview;
  }
  return next;
}

function StructuredFilters({
  categories,
  filter,
  palette,
  onApply,
}: {
  readonly categories: readonly Category[];
  readonly filter: LedgerQuery;
  readonly palette: Palette;
  readonly onApply: (filter: LedgerQuery) => void;
}) {
  const [month, setMonth] = useState(
    filter.date.kind === 'MONTH' ? filter.date.month : '2026-09',
  );
  const [merchant, setMerchant] = useState(filter.merchant ?? '');
  const [amount, setAmount] = useState(
    filter.amount === undefined
      ? ''
      : formatMinorInput(filter.amount.thresholdMinor),
  );
  const [comparator, setComparator] = useState<AmountComparator>(
    filter.amount?.comparator ?? 'GREATER_THAN',
  );
  const [superCategory, setSuperCategory] = useState(
    filter.superCategories?.[0] ?? null,
  );
  const [categoryId, setCategoryId] = useState(filter.categoryIds?.[0] ?? null);
  const [eventType, setEventType] = useState<EventType | null>(
    filter.eventTypes?.[0] ?? null,
  );
  const [scope, setScope] = useState<BudgetScope | null>(
    filter.scopes?.[0] ?? null,
  );
  const [weekdayMode, setWeekdayMode] = useState<
    'ANY' | 'WEEKENDS' | 'SATURDAY'
  >(
    filter.weekdays?.includes(0)
      ? 'WEEKENDS'
      : filter.weekdays?.includes(6)
        ? 'SATURDAY'
        : 'ANY',
  );
  const [needsReview, setNeedsReview] = useState(filter.needsReview === true);
  const [error, setError] = useState<string | null>(null);

  return (
    <View
      style={[
        styles.filterPanel,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      testID="structured-filters"
    >
      <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
        Canonical local filters
      </Text>
      <TextInput
        accessibilityLabel="Month in YYYY-MM format"
        onChangeText={setMonth}
        style={[
          styles.textField,
          { borderColor: palette.border, color: palette.text },
        ]}
        testID="filter-month"
        value={month}
      />
      <TextInput
        accessibilityLabel="Merchant contains"
        onChangeText={setMerchant}
        placeholder="Merchant contains"
        placeholderTextColor={palette.muted}
        style={[
          styles.textField,
          { borderColor: palette.border, color: palette.text },
        ]}
        testID="filter-merchant"
        value={merchant}
      />
      <View style={styles.inputRow}>
        <ChoiceButton
          label={comparatorSymbol(comparator)}
          palette={palette}
          selected
          onPress={() =>
            setComparator((current) =>
              current === 'GREATER_THAN' ? 'LESS_THAN' : 'GREATER_THAN',
            )
          }
        />
        <TextInput
          accessibilityLabel="Amount in pounds"
          keyboardType="decimal-pad"
          onChangeText={setAmount}
          placeholder="Amount £"
          placeholderTextColor={palette.muted}
          style={[
            styles.textField,
            styles.flexField,
            { borderColor: palette.border, color: palette.text },
          ]}
          testID="filter-amount"
          value={amount}
        />
      </View>
      <ChoiceGroup
        label="Allocation"
        palette={palette}
        choices={SUPER_CATEGORY_KEYS.map((value) => ({
          key: value,
          label: value[0] + value.slice(1).toLowerCase(),
        }))}
        selected={superCategory}
        onSelect={(value) =>
          setSuperCategory(value === superCategory ? null : value)
        }
      />
      <ChoiceGroup
        label="Category"
        palette={palette}
        choices={categories.map(({ id, name }) => ({ key: id, label: name }))}
        selected={categoryId}
        onSelect={(value) => setCategoryId(value === categoryId ? null : value)}
      />
      <ChoiceGroup
        label="Event type"
        palette={palette}
        choices={EVENT_TYPES.map((value) => ({
          key: value,
          label: value.replaceAll('_', ' '),
        }))}
        selected={eventType}
        onSelect={(value) => setEventType(value === eventType ? null : value)}
      />
      <ChoiceGroup
        label="Budget scope"
        palette={palette}
        choices={BUDGET_SCOPES.map((value) => ({
          key: value,
          label: value === 'INCLUDED' ? 'Included' : 'Excluded',
        }))}
        selected={scope}
        onSelect={(value) => setScope(value === scope ? null : value)}
      />
      <ChoiceGroup
        label="Day"
        palette={palette}
        choices={[
          { key: 'ANY', label: 'Any day' },
          { key: 'WEEKENDS', label: 'Weekends' },
          { key: 'SATURDAY', label: 'Saturday' },
        ]}
        selected={weekdayMode}
        onSelect={setWeekdayMode}
      />
      <ChoiceButton
        label="Needs Review"
        palette={palette}
        selected={needsReview}
        onPress={() => setNeedsReview((value) => !value)}
      />
      <Text style={[styles.smallText, { color: palette.muted }]}>
        Subscription status remains unavailable until subscription metadata
        ships; the Subscriptions category is filterable now.
      </Text>
      {error === null ? null : (
        <Text accessibilityRole="alert" style={{ color: palette.warning }}>
          {error}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
            setError('Enter a month as YYYY-MM.');
            return;
          }
          let parsedAmount: number | null = null;
          try {
            parsedAmount =
              amount.trim() === '' ? null : parseMinorInput(amount);
          } catch {
            setError('Enter an amount with no more than two decimal places.');
            return;
          }
          setError(null);
          onApply({
            date: { kind: 'MONTH', month },
            ...(merchant.trim() === '' ? {} : { merchant: merchant.trim() }),
            ...(parsedAmount === null
              ? {}
              : { amount: { comparator, thresholdMinor: parsedAmount } }),
            ...(superCategory === null
              ? {}
              : { superCategories: [superCategory] }),
            ...(categoryId === null ? {} : { categoryIds: [categoryId] }),
            ...(eventType === null ? {} : { eventTypes: [eventType] }),
            ...(scope === null ? {} : { scopes: [scope] }),
            ...(weekdayMode === 'ANY'
              ? {}
              : { weekdays: weekdayMode === 'WEEKENDS' ? [0, 6] : [6] }),
            ...(needsReview ? { needsReview: true } : {}),
          });
        }}
        style={[styles.modalSave, { backgroundColor: palette.accent }]}
        testID="filters-apply"
      >
        <Text style={[styles.smallButtonText, { color: palette.accentText }]}>
          Apply filters
        </Text>
      </Pressable>
    </View>
  );
}

interface EditorSplit {
  readonly id: string;
  readonly amount: string;
  readonly eventType: EventType;
  readonly budgetScope: BudgetScope;
  readonly categoryId: string | null;
}

function TransactionEditor({
  categories,
  database,
  nextMutation,
  onCancel,
  onPartialFailure,
  onSaved,
  palette,
  transaction,
}: {
  readonly categories: readonly Category[];
  readonly database: Database;
  readonly nextMutation: () => {
    readonly timestamp: string;
    readonly suffix: string;
  };
  readonly onCancel: () => void;
  readonly onPartialFailure: (message: string) => void;
  readonly onSaved: () => void;
  readonly palette: Palette;
  readonly transaction: ClassifiedTransaction;
}) {
  const [eventType, setEventType] = useState(
    transaction.classification.eventType,
  );
  const [scope, setScope] = useState(transaction.classification.budgetScope);
  const [categoryId, setCategoryId] = useState(
    transaction.classification.categoryId,
  );
  const [note, setNote] = useState(transaction.classification.note ?? '');
  const [rememberRule, setRememberRule] = useState(false);
  const [splits, setSplits] = useState<readonly EditorSplit[]>(
    transaction.splits.map((split) => ({
      id: split.id,
      amount: formatMinorInput(split.amountMinorAbs),
      eventType: split.eventType,
      budgetScope: split.budgetScope,
      categoryId: split.categoryId,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const rawAmount = Math.abs(transaction.raw.amountMinor);
  const splitTotal = splits.reduce((total, split) => {
    try {
      return total + parseMinorInput(split.amount);
    } catch {
      return total;
    }
  }, 0);
  const remainder = rawAmount - splitTotal;

  const enableSplit = () => {
    const halves = allocateByBasisPoints(
      money(rawAmount, transaction.raw.currency),
      { FIRST: 5_000, SECOND: 5_000 },
    );
    const first = halves.FIRST?.amountMinor ?? 0;
    const second = halves.SECOND?.amountMinor ?? 0;
    setSplits([
      {
        id: `split:${transaction.raw.id}:1`,
        amount: formatMinorInput(first),
        eventType,
        budgetScope: scope,
        categoryId,
      },
      {
        id: `split:${transaction.raw.id}:2`,
        amount: formatMinorInput(second),
        eventType,
        budgetScope: scope,
        categoryId,
      },
    ]);
  };

  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible>
      <ScrollView
        contentContainerStyle={styles.modalScroll}
        style={styles.modalScrollView}
      >
        <View
          accessibilityViewIsModal
          style={[
            styles.modalCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          testID="transaction-editor"
        >
          <Text style={[styles.cardTitle, { color: palette.text }]}>
            Correct transaction
          </Text>
          <Text style={[styles.bodyText, { color: palette.text }]}>
            {transaction.raw.merchantName ?? transaction.raw.description} ·{' '}
            {formatMoney(money(rawAmount, transaction.raw.currency), 'en-GB')}
          </Text>
          <ChoiceGroup
            label="Event type"
            palette={palette}
            choices={EVENT_TYPES.map((value) => ({
              key: value,
              label: value.replaceAll('_', ' '),
            }))}
            selected={eventType}
            onSelect={setEventType}
          />
          <ChoiceGroup
            label="Budget scope"
            palette={palette}
            choices={BUDGET_SCOPES.map((value) => ({
              key: value,
              label: value === 'INCLUDED' ? 'Included' : 'Excluded',
            }))}
            selected={scope}
            onSelect={setScope}
          />
          <ChoiceGroup
            label="Category"
            palette={palette}
            choices={categories.map(({ id, name }) => ({
              key: id,
              label: name,
            }))}
            selected={categoryId}
            onSelect={setCategoryId}
          />
          <TextInput
            accessibilityLabel="Transaction note"
            multiline
            onChangeText={setNote}
            placeholder="Optional note"
            placeholderTextColor={palette.muted}
            style={[
              styles.noteInput,
              { borderColor: palette.border, color: palette.text },
            ]}
            testID="transaction-note"
            value={note}
          />
          {splits.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={enableSplit}
              style={styles.secondaryButton}
              testID="split-enable"
            >
              <Text style={[styles.smallButtonText, { color: palette.accent }]}>
                Split transaction
              </Text>
            </Pressable>
          ) : (
            <View style={styles.splitPanel}>
              <View style={styles.cardTitleRow}>
                <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
                  Split portions
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSplits([])}
                  style={styles.textButton}
                >
                  <Text style={[styles.smallText, { color: palette.muted }]}>
                    Remove split
                  </Text>
                </Pressable>
              </View>
              {splits.map((split, index) => (
                <View
                  key={split.id}
                  style={[styles.splitCard, { borderColor: palette.border }]}
                >
                  <Text style={[styles.smallText, { color: palette.muted }]}>
                    Portion {index + 1}
                  </Text>
                  <TextInput
                    accessibilityLabel={`Split portion ${index + 1} amount in pounds`}
                    keyboardType="decimal-pad"
                    onChangeText={(amount) =>
                      setSplits((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, amount } : item,
                        ),
                      )
                    }
                    style={[
                      styles.textField,
                      { borderColor: palette.border, color: palette.text },
                    ]}
                    testID={`split-amount-${index}`}
                    value={split.amount}
                  />
                  <ChoiceGroup
                    label="Type"
                    palette={palette}
                    choices={EVENT_TYPES.map((value) => ({
                      key: value,
                      label: value.replaceAll('_', ' '),
                    }))}
                    selected={split.eventType}
                    onSelect={(value) =>
                      setSplits((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, eventType: value }
                            : item,
                        ),
                      )
                    }
                  />
                  <ChoiceGroup
                    label="Scope"
                    palette={palette}
                    choices={BUDGET_SCOPES.map((value) => ({
                      key: value,
                      label: value,
                    }))}
                    selected={split.budgetScope}
                    onSelect={(value) =>
                      setSplits((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, budgetScope: value }
                            : item,
                        ),
                      )
                    }
                  />
                  <ChoiceGroup
                    label="Category"
                    palette={palette}
                    choices={categories.map(({ id, name }) => ({
                      key: id,
                      label: name,
                    }))}
                    selected={split.categoryId}
                    onSelect={(value) =>
                      setSplits((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, categoryId: value }
                            : item,
                        ),
                      )
                    }
                  />
                </View>
              ))}
              <Text
                accessibilityRole={remainder === 0 ? undefined : 'alert'}
                style={{
                  color: remainder === 0 ? palette.text : palette.warning,
                  fontWeight: '800',
                }}
                testID="split-remainder"
              >
                {remainder === 0
                  ? 'Exact total · no remainder'
                  : `${formatMoney(
                      money(Math.abs(remainder), transaction.raw.currency),
                      'en-GB',
                    )} ${remainder > 0 ? 'remaining' : 'over allocated'}`}
              </Text>
            </View>
          )}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: rememberRule }}
            onPress={() => setRememberRule((value) => !value)}
            style={styles.checkRow}
            testID="remember-merchant-rule"
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: rememberRule
                    ? palette.accent
                    : 'transparent',
                  borderColor: palette.border,
                },
              ]}
            />
            <Text style={[styles.bodyText, { color: palette.text }]}>
              Apply these top-level choices to future matching merchant records
            </Text>
          </Pressable>
          {error === null ? null : (
            <Text accessibilityRole="alert" style={{ color: palette.warning }}>
              {error}
            </Text>
          )}
          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const mutation = nextMutation();
                undoLatestClassificationChange(
                  database,
                  transaction.raw.id,
                  mutation.timestamp,
                )
                  .then((undone) => {
                    if (!undone) {
                      setError('There is no saved correction to undo.');
                      return;
                    }
                    onSaved();
                  })
                  .catch(() =>
                    setError('The latest correction could not be undone.'),
                  );
              }}
              style={styles.secondaryButton}
              testID="classification-undo"
            >
              <Text style={[styles.smallButtonText, { color: palette.muted }]}>
                Undo latest
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.secondaryButton}
            >
              <Text style={[styles.smallButtonText, { color: palette.muted }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (splits.length > 0 && remainder !== 0) {
                  setError(
                    'Split portions must leave an exact zero remainder.',
                  );
                  return;
                }
                let portions;
                try {
                  portions = splits.map((split, index) => ({
                    id: `manual-split:${transaction.raw.id}:${index + 1}:${nextMutation().suffix}`,
                    amountMinorAbs: parseMinorInput(split.amount),
                    eventType: split.eventType,
                    budgetScope: split.budgetScope,
                    categoryId: split.categoryId,
                    note: null,
                  }));
                } catch {
                  setError(
                    'Split amounts must use whole pounds and up to two decimal places.',
                  );
                  return;
                }
                const mutation = nextMutation();
                saveTransactionCorrection(database, {
                  changeId: `change:${transaction.raw.id}:${mutation.suffix}`,
                  classificationId: `manual:${transaction.raw.id}:${mutation.suffix}`,
                  rawTransactionId: transaction.raw.id,
                  eventType,
                  budgetScope: scope,
                  categoryId,
                  countsTowardBudgetBase: eventType === 'INCOME',
                  note,
                  splits: portions,
                  timestamp: mutation.timestamp,
                })
                  .then(async () => {
                    if (!rememberRule) {
                      onSaved();
                      return;
                    }
                    const ruleMutation = nextMutation();
                    try {
                      await createMerchantRule(database, {
                        id: `rule:${transaction.raw.id}:${ruleMutation.suffix}`,
                        priority: 100,
                        matchValue:
                          transaction.raw.merchantName ??
                          transaction.raw.description,
                        resultEventType: eventType,
                        resultCategoryId: categoryId,
                        resultBudgetScope: scope,
                        timestamp: ruleMutation.timestamp,
                      });
                      onSaved();
                    } catch {
                      onSaved();
                      onPartialFailure(
                        'The correction was saved, but the future merchant rule could not be created.',
                      );
                    }
                  })
                  .catch(() =>
                    setError('The transaction correction could not be saved.'),
                  );
              }}
              style={[styles.modalSave, { backgroundColor: palette.accent }]}
              testID="transaction-save"
            >
              <Text
                style={[styles.smallButtonText, { color: palette.accentText }]}
              >
                Save correction
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}

function RuleEditor({
  categories,
  database,
  nextMutation,
  onCancel,
  onSaved,
  palette,
  rule,
}: {
  readonly categories: readonly Category[];
  readonly database: Database;
  readonly nextMutation: () => {
    readonly timestamp: string;
    readonly suffix: string;
  };
  readonly onCancel: () => void;
  readonly onSaved: () => void;
  readonly palette: Palette;
  readonly rule: ClassificationRule;
}) {
  const [matchValue, setMatchValue] = useState(rule.matchValue);
  const [eventType, setEventType] = useState(rule.resultEventType);
  const [categoryId, setCategoryId] = useState(rule.resultCategoryId);
  const [scope, setScope] = useState<BudgetScope>(
    rule.resultBudgetScope ?? 'INCLUDED',
  );
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal animationType="none" onRequestClose={onCancel} transparent visible>
      <View style={styles.modalBackdrop}>
        <View
          accessibilityViewIsModal
          style={[
            styles.modalCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          testID="rule-editor"
        >
          <Text
            accessibilityRole="header"
            style={[styles.cardTitle, { color: palette.text }]}
          >
            Edit future rule
          </Text>
          <TextInput
            accessibilityLabel="Exact merchant name"
            onChangeText={setMatchValue}
            style={[
              styles.textField,
              { borderColor: palette.border, color: palette.text },
            ]}
            value={matchValue}
          />
          <ChoiceGroup
            label="Event type"
            palette={palette}
            choices={EVENT_TYPES.map((value) => ({
              key: value,
              label: value.replaceAll('_', ' '),
            }))}
            selected={eventType}
            onSelect={setEventType}
          />
          <ChoiceGroup
            label="Scope"
            palette={palette}
            choices={BUDGET_SCOPES.map((value) => ({
              key: value,
              label: value,
            }))}
            selected={scope}
            onSelect={setScope}
          />
          <ChoiceGroup
            label="Category"
            palette={palette}
            choices={categories.map(({ id, name }) => ({
              key: id,
              label: name,
            }))}
            selected={categoryId}
            onSelect={setCategoryId}
          />
          {error === null ? null : (
            <Text accessibilityRole="alert" style={{ color: palette.warning }}>
              {error}
            </Text>
          )}
          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={styles.secondaryButton}
            >
              <Text style={[styles.smallButtonText, { color: palette.muted }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const mutation = nextMutation();
                updateMerchantRule(database, rule.id, {
                  priority: rule.priority,
                  matchValue,
                  resultEventType: eventType,
                  resultCategoryId: categoryId,
                  resultBudgetScope: scope,
                  timestamp: mutation.timestamp,
                })
                  .then(onSaved)
                  .catch(() =>
                    setError('The future merchant rule could not be saved.'),
                  );
              }}
              style={[styles.modalSave, { backgroundColor: palette.accent }]}
              testID="rule-save"
            >
              <Text
                style={[styles.smallButtonText, { color: palette.accentText }]}
              >
                Save rule
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ChoiceGroup<const T extends string>({
  label,
  choices,
  selected,
  palette,
  onSelect,
}: {
  readonly label: string;
  readonly choices: readonly { readonly key: T; readonly label: string }[];
  readonly selected: T | null;
  readonly palette: Palette;
  readonly onSelect: (key: T) => void;
}) {
  return (
    <View style={styles.choiceGroup}>
      <Text style={[styles.label, { color: palette.muted }]}>{label}</Text>
      <View style={styles.chipRow}>
        {choices.map((choice) => (
          <ChoiceButton
            key={choice.key}
            label={choice.label}
            palette={palette}
            selected={choice.key === selected}
            onPress={() => onSelect(choice.key)}
          />
        ))}
      </View>
    </View>
  );
}

function ChoiceButton({
  label,
  palette,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly palette: Palette;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}`}
      onPress={onPress}
      style={[
        styles.choiceButton,
        {
          backgroundColor: selected ? palette.accent : palette.surfaceMuted,
          borderColor: selected ? palette.accent : palette.border,
        },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          { color: selected ? palette.accentText : palette.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function parseMinorInput(value: string): number {
  return parseDecimalMoney(value, 'GBP').amountMinor;
}

function formatMinorInput(value: number): string {
  return `${Math.trunc(value / 100)}.${String(value % 100).padStart(2, '0')}`;
}

function comparatorSymbol(comparator: AmountComparator): string {
  return (
    {
      EQUAL: '=',
      GREATER_THAN: '>',
      GREATER_THAN_OR_EQUAL: '≥',
      LESS_THAN: '<',
      LESS_THAN_OR_EQUAL: '≤',
    } as const
  )[comparator];
}

function QueryStateScreen({
  palette,
  status,
  onRetry,
}: {
  readonly palette: Palette;
  readonly status: Exclude<QueryLoadState, { status: 'READY' }>['status'];
  readonly onRetry: () => void;
}) {
  return (
    <View
      accessibilityLabel={asyncStateLabel(
        'Breakdown',
        status === 'IDLE' ? 'LOADING' : status,
      )}
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: status !== 'ERROR' }}
      style={styles.centered}
    >
      {status === 'LOADING' ? (
        <ActivityIndicator
          accessibilityElementsHidden
          color={palette.accent}
          size="large"
        />
      ) : null}
      <Text style={[styles.heroTitle, { color: palette.text }]}>
        {status === 'ERROR' ? 'Breakdown unavailable' : 'Loading Breakdown'}
      </Text>
      <Text style={[styles.heroBody, { color: palette.muted }]}>
        {status === 'ERROR'
          ? 'The local query could not be completed.'
          : 'Applying structured local filters.'}
      </Text>
      {status === 'ERROR' ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={[styles.primaryButton, { backgroundColor: palette.accent }]}
          testID="breakdown-retry"
        >
          <Text
            style={[styles.primaryButtonText, { color: palette.accentText }]}
          >
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TransactionTreeRow({
  transaction,
  palette,
  onPress,
}: {
  readonly transaction: ReturnType<
    typeof createExplorerViewModel
  >['transactions'][number];
  readonly palette: Palette;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Edit ${transaction.description}, ${transaction.amountLabel}`}
      onPress={onPress}
      style={[styles.treeTransaction, { borderTopColor: palette.border }]}
      testID={`transaction-${transaction.id}`}
    >
      <View style={styles.cardTitleRow}>
        <View style={styles.transactionText}>
          <Text style={[styles.transactionTitle, { color: palette.text }]}>
            {transaction.description}
          </Text>
          <Text style={[styles.smallText, { color: palette.muted }]}>
            {transaction.dateLabel} · {transaction.categoryLabel}
          </Text>
        </View>
        <Text style={[styles.transactionAmount, { color: palette.text }]}>
          {transaction.amountLabel}
        </Text>
      </View>
      <View style={styles.badgeRow}>
        <Badge
          label={transaction.typeLabel}
          palette={palette}
          emphasized={transaction.typeLabel !== 'Purchase'}
        />
        <Badge
          label={transaction.scopeLabel}
          palette={palette}
          emphasized={transaction.scopeLabel !== 'Included in budget'}
        />
        {transaction.confidenceLabel === null ? null : (
          <Badge
            label={transaction.confidenceLabel}
            palette={palette}
            emphasized
          />
        )}
      </View>
      {transaction.note === null ? null : (
        <Text style={[styles.smallText, { color: palette.muted }]}>
          Note: {transaction.note}
        </Text>
      )}
      <Text style={[styles.smallText, { color: palette.muted }]}>
        Updated {transaction.updatedAtLabel}
      </Text>
    </Pressable>
  );
}

function SummaryMetric({
  label,
  value,
  palette,
}: {
  readonly label: string;
  readonly value: string;
  readonly palette: Palette;
}) {
  return (
    <View
      style={[
        styles.summaryMetric,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.label, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.cardAmount, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

function Badge({
  label,
  palette,
  emphasized,
}: {
  readonly label: string;
  readonly palette: Palette;
  readonly emphasized: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: emphasized ? palette.surfaceMuted : 'transparent',
          borderColor: palette.border,
        },
      ]}
    >
      <Text style={[styles.badgeText, { color: palette.muted }]}>{label}</Text>
    </View>
  );
}

function CoreNavigation({
  active,
  palette,
  onHome,
  onBreakdown,
  onTrends,
  onSubscriptions,
  onSettings,
}: {
  readonly active:
    'HOME' | 'BREAKDOWN' | 'TRENDS' | 'SUBSCRIPTIONS' | 'SETTINGS' | 'NONE';
  readonly palette: Palette;
  readonly onHome: () => void;
  readonly onBreakdown: () => void;
  readonly onTrends: () => void;
  readonly onSubscriptions: () => void;
  readonly onSettings: () => void;
}) {
  return (
    <View
      accessibilityLabel="Primary destinations"
      accessibilityRole="tablist"
      style={[
        styles.coreNavigation,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Destination
        label="Home"
        active={active === 'HOME'}
        palette={palette}
        onPress={onHome}
      />
      <Destination
        label="Breakdown"
        active={active === 'BREAKDOWN'}
        palette={palette}
        onPress={onBreakdown}
      />
      <Destination
        label="Trends"
        active={active === 'TRENDS'}
        palette={palette}
        onPress={onTrends}
      />
      <Destination
        label="Subscriptions"
        active={active === 'SUBSCRIPTIONS'}
        palette={palette}
        onPress={onSubscriptions}
      />
      <Destination
        label="Settings"
        active={active === 'SETTINGS'}
        palette={palette}
        onPress={onSettings}
      />
    </View>
  );
}

function Destination({
  label,
  active = false,
  palette,
  onPress,
}: {
  readonly label: string;
  readonly active?: boolean;
  readonly palette: Palette;
  readonly onPress?: () => void;
}) {
  const available = onPress !== undefined;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={
        available ? label : `${label}, planned for a later app layer`
      }
      accessibilityState={{ disabled: !available, selected: active }}
      disabled={!available}
      onPress={onPress}
      style={[
        styles.destination,
        active
          ? { backgroundColor: palette.surfaceMuted }
          : { backgroundColor: 'transparent' },
      ]}
      testID={`destination-${label.toLowerCase()}`}
    >
      <Text
        style={[
          styles.destinationLabel,
          { color: active ? palette.text : palette.muted },
        ]}
      >
        {label}
      </Text>
      {!available ? (
        <Text style={[styles.destinationLater, { color: palette.muted }]}>
          LATER
        </Text>
      ) : null}
    </Pressable>
  );
}

function StateScreen({
  palette,
  title,
  body,
  loading = false,
  onRetry,
}: {
  readonly palette: Palette;
  readonly title: string;
  readonly body: string;
  readonly loading?: boolean;
  readonly onRetry?: () => void;
}) {
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      <View
        accessibilityLabel={asyncStateLabel(
          'local ledger',
          loading ? 'LOADING' : 'ERROR',
        )}
        accessibilityLiveRegion="polite"
        accessibilityState={{ busy: loading }}
        style={styles.centered}
      >
        {loading ? (
          <ActivityIndicator
            accessibilityElementsHidden
            color={palette.accent}
            size="large"
          />
        ) : null}
        <Text
          accessibilityRole="header"
          style={[styles.heroTitle, { color: palette.text }]}
        >
          {title}
        </Text>
        <Text style={[styles.heroBody, { color: palette.muted }]}>{body}</Text>
        {onRetry === undefined ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={[styles.primaryButton, { backgroundColor: palette.accent }]}
            testID="ledger-retry"
          >
            <Text
              style={[styles.primaryButtonText, { color: palette.accentText }]}
            >
              Try again
            </Text>
          </Pressable>
        )}
      </View>
      <StatusBar style={palette === DARK ? 'light' : 'dark'} />
    </SafeAreaView>
  );
}

function progressPercent(percentageLabel: string): number {
  if (percentageLabel === 'No target set') {
    return 0;
  }
  const parsed = Number.parseFloat(percentageLabel);
  return Math.max(0, Math.min(100, parsed));
}

function categoryColor(
  key: ReturnType<typeof createHomeViewModel>['cards'][number]['key'],
  palette: Palette,
): string {
  if (key === 'LIVING') {
    return palette.living;
  }
  if (key === 'SAVING') {
    return palette.saving;
  }
  return palette.fun;
}

function trendSuperLabel(key: SuperCategoryKey): string {
  if (key === 'LIVING') {
    return 'Living';
  }
  if (key === 'SAVING') {
    return 'Saving';
  }
  return 'Fun';
}

function trendSegmentColor(
  key: SuperCategoryKey,
  index: number,
  palette: Palette,
): string {
  const opacity = ['ff', 'd9', 'b3', '8c', '66'][index % 5] ?? 'ff';
  return `${categoryColor(key, palette)}${opacity}`;
}

function compactMinor(amountMinor: number, currency: string): string {
  return formatMoney(money(amountMinor, currency), 'en-GB');
}

function formatTrendMonth(month: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function formatTrendMonthShort(month: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function formatActivityDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatDailyReference(
  heatMap: MonthlyHeatMap,
  currency: string,
): string {
  const numerator = BigInt(heatMap.dailyReferenceNumeratorMinor);
  const denominator = BigInt(heatMap.dailyReferenceDenominator);
  const roundedMinor = Number((numerator + denominator / 2n) / denominator);
  return formatMoney(money(roundedMinor, currency), 'en-GB');
}

function heatColor(
  day: MonthlyHeatMap['days'][number],
  palette: Palette,
): string {
  if (day.tone === 'NEUTRAL') {
    return palette.surfaceMuted;
  }
  if (day.tone === 'GREEN') {
    return mixHex(palette.surfaceMuted, palette.fun, day.intensityBasisPoints);
  }
  return mixHex('#6e4042', palette.breach, day.intensityBasisPoints);
}

function mixHex(start: string, end: string, basisPoints: number): string {
  const startChannels = hexChannels(start);
  const endChannels = hexChannels(end);
  const channels = startChannels.map((channel, index) => {
    const endChannel = endChannels[index] ?? channel;
    return Math.round(
      channel + ((endChannel - channel) * basisPoints) / 10_000,
    );
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function hexChannels(value: string): readonly number[] {
  const normalized = value.replace('#', '');
  return [0, 2, 4].map((start) =>
    Number.parseInt(normalized.slice(start, start + 2), 16),
  );
}

function touchBasisPoints(event: GestureResponderEvent): number {
  const x = event.nativeEvent.locationX - RING_CENTER;
  const y = event.nativeEvent.locationY - RING_CENTER;
  const angle = Math.atan2(y, x) + Math.PI / 2;
  const normalized = angle < 0 ? angle + 2 * Math.PI : angle;
  return Math.round((normalized * 10_000) / (2 * Math.PI));
}

function circularDistance(left: number, right: number): number {
  const direct = Math.abs(left - right);
  return Math.min(direct, 10_000 - direct);
}

function boundaryPosition(basisPoints: number): { x: number; y: number } {
  const angle = (basisPoints * 2 * Math.PI) / 10_000 - Math.PI / 2;
  return {
    x: RING_CENTER + Math.cos(angle) * RING_RADIUS,
    y: RING_CENTER + Math.sin(angle) * RING_RADIUS,
  };
}

function formatBasisPointLabel(value: number): string {
  return `${formatBasisPointInput(value)}%`;
}

function formatBasisPointInput(value: number): string {
  const whole = Math.trunc(value / 100);
  const fraction = value % 100;
  return fraction === 0
    ? String(whole)
    : `${whole}.${fraction.toString().padStart(2, '0').replace(/0$/, '')}`;
}

function toLoadState(snapshot: LedgerSnapshot): LoadState {
  return !snapshot.isDemoLoaded || snapshot.ledgerMonth === null
    ? { status: 'EMPTY' }
    : { status: 'READY', snapshot };
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 48,
    gap: 12,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: 28,
    gap: 16,
  },
  demoPill: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroTitle: {
    maxWidth: 440,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  heroBody: {
    maxWidth: 520,
    fontSize: 17,
    lineHeight: 25,
  },
  primaryButton: {
    minHeight: 52,
    minWidth: 190,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: { fontSize: 17, fontWeight: '800' },
  smallText: { fontSize: 13, lineHeight: 18 },
  topRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  screenTitle: { marginTop: 4, fontSize: 30, fontWeight: '800' },
  textButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonLabel: { fontSize: 16, fontWeight: '700' },
  monthActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  monthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthButton: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  allocationPanel: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.7 },
  moneyHero: { marginTop: 4, fontSize: 30, fontWeight: '800' },
  ratioHero: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  bodyText: { fontSize: 15, lineHeight: 21 },
  bodyTextStrong: { fontSize: 15, lineHeight: 21, fontWeight: '800' },
  notice: { borderWidth: 1, borderRadius: 12, padding: 14 },
  experimentalEntry: {
    minHeight: 72,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionKicker: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  allocationHeader: {
    minHeight: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
  },
  allocationBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    flexWrap: 'wrap',
  },
  allocationLegend: { flex: 1, minWidth: 170, gap: 4 },
  allocationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  smallButtonText: { fontSize: 14, fontWeight: '800' },
  allocationTrack: {
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  allocationRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  identityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  identityDot: { width: 9, height: 9, borderRadius: 5 },
  positionPanel: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  positionRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    padding: 16,
    gap: 9,
  },
  cardTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTitle: { fontSize: 21, fontWeight: '800' },
  positionStatus: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
  },
  cardAmount: { fontSize: 24, fontWeight: '800' },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progress: { height: 10, borderRadius: 5 },
  runoverContainer: { position: 'relative', overflow: 'hidden' },
  runoverTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: RUNOVER_ROW_HEIGHT - 3,
    borderRadius: 5,
    overflow: 'hidden',
  },
  runoverFill: { height: RUNOVER_ROW_HEIGHT - 3, borderRadius: 5 },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  sectionTitle: { marginTop: 12, fontSize: 20, fontWeight: '800' },
  activityList: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  activityRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
  },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryMetric: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  subscriptionSummary: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  subscriptionCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  subscriptionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  settingsCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  settingsSection: { gap: 8, alignItems: 'flex-start' },
  settingsActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineStatus: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  restoreInput: {
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabel: {
    position: 'absolute',
    width: RING_SIZE,
    alignItems: 'center',
  },
  ringRatio: { fontSize: 17, fontWeight: '900' },
  ringHandle: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 22,
  },
  modalCard: { borderWidth: 1, borderRadius: 18, padding: 20, gap: 14 },
  editorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  percentageInput: {
    minWidth: 72,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    textAlign: 'right',
    fontSize: 17,
  },
  modalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalSave: {
    minHeight: 48,
    minWidth: 90,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  heatMapPanel: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  calendarContent: { minWidth: 350, flex: 1 },
  weekRow: { flexDirection: 'row' },
  weekLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
  },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: `${100 / 7}%`,
    minHeight: 48,
    aspectRatio: 1,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDay: {
    fontSize: 14,
    fontWeight: '700',
  },
  calendarCue: { fontSize: 12, lineHeight: 14, fontWeight: '900' },
  heatLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  legendSwatch: { width: 16, height: 12, borderRadius: 3 },
  legendGradientGreen: {
    width: 42,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#177346',
  },
  legendGradientRed: {
    width: 42,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#b4232d',
  },
  legendText: { fontSize: 10, fontWeight: '700' },
  superCategoryGroup: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  superCategoryHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  superCategoryTitle: { fontSize: 22, fontWeight: '900' },
  categoryGroup: { borderTopWidth: 1, paddingTop: 12, gap: 8 },
  breakdownGroup: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  breakdownHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  breakdownTitleBlock: { flex: 1, gap: 8 },
  breakdownAmount: { alignItems: 'flex-end', minWidth: 100 },
  categoryTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  categoryFill: { height: 7, borderRadius: 4 },
  treeTransaction: {
    minHeight: 48,
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 5,
  },
  transactionText: { flex: 1 },
  transactionTitle: { flex: 1, fontSize: 16, fontWeight: '800' },
  transactionAmount: { fontSize: 17, fontWeight: '800' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  searchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  searchButton: {
    minHeight: 52,
    minWidth: 76,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterChip: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  filterPanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  textField: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  noteInput: {
    minHeight: 78,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  flexField: { flex: 1 },
  inputRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  choiceGroup: { gap: 7 },
  choiceButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 999,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  splitPanel: { gap: 10 },
  splitCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  checkRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: { width: 24, height: 24, borderWidth: 2, borderRadius: 6 },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
  },
  modalScrollView: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  ruleRow: {
    minHeight: 56,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  ruleMain: { flex: 1, minHeight: 48, justifyContent: 'center' },
  ruleToggle: {
    minHeight: 48,
    minWidth: 76,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  trendControls: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  moneyMapControls: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  moneyMapPanel: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  moneyMapSourceRow: { padding: 16 },
  moneyMapSource: {
    minHeight: 72,
    borderRadius: 14,
    padding: 14,
    justifyContent: 'center',
  },
  moneyMapBranch: {
    borderTopWidth: 1,
    padding: 16,
    gap: 10,
  },
  moneyMapBranchHeader: {
    minHeight: 56,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  moneyMapFlow: {
    height: 18,
    minWidth: 2,
    borderRadius: 4,
  },
  moneyMapCategories: { gap: 2 },
  moneyMapCategoryRow: {
    minHeight: 52,
    justifyContent: 'center',
    gap: 12,
  },
  moneyMapCategoryHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  moneyMapCategoryLabel: { flex: 1 },
  moneyMapCategoryFlow: {
    height: 7,
    minWidth: 2,
    borderRadius: 3,
  },
  moneyMapNet: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  moneyMapTable: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  moneyMapTableRow: {
    borderTopWidth: 1,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
  },
  trendChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trendChip: {
    minHeight: 48,
    minWidth: 58,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customPeriodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  monthInput: {
    minHeight: 48,
    width: 102,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  applyButton: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendLoading: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  trendChartPanel: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    gap: 10,
    overflow: 'hidden',
  },
  trendLegend: { paddingHorizontal: 14 },
  trendMonthsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    gap: 14,
  },
  trendMonthGroup: {
    alignItems: 'center',
    gap: 4,
  },
  trendBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  trendBarColumn: {
    width: 68,
    alignItems: 'center',
  },
  trendBarValue: {
    width: 68,
    fontSize: 10,
    lineHeight: 12,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  trendBarValueButton: {
    width: 68,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendPositiveArea: {
    width: 46,
    height: 180,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  trendPositiveStack: {
    width: 32,
    alignSelf: 'center',
    justifyContent: 'flex-end',
  },
  trendSegment: {
    width: 32,
    minHeight: 2,
    borderTopWidth: 1,
  },
  trendTargetRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    zIndex: 2,
  },
  trendZeroMarker: {
    width: 32,
    height: 3,
    alignSelf: 'center',
  },
  trendAxis: { width: 52, height: 1 },
  trendNegativeArea: {
    width: 32,
    height: 72,
    alignItems: 'stretch',
  },
  trendNegativeSegment: {
    width: 32,
    minHeight: 2,
  },
  trendBarLabelButton: {
    minHeight: 48,
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendBarLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  trendTargetLabel: {
    width: 68,
    minHeight: 28,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
  },
  trendMonthButton: {
    minHeight: 48,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendMonthLabel: { fontSize: 12, fontWeight: '800' },
  trendDetail: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  trendDetailMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trendCompositionRow: {
    minHeight: 52,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  coreNavigation: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  destination: {
    flex: 1,
    minWidth: 72,
    minHeight: 54,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  destinationLabel: { fontSize: 11, fontWeight: '800' },
  destinationLater: { marginTop: 2, fontSize: 8, fontWeight: '800' },
});
