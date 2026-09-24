import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Svg, { Circle, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type GestureResponderEvent,
} from 'react-native';

import {
  createRunoverModel,
  DEFAULT_ALLOCATION,
  parseAllocationPercentages,
  ratiosFromBoundaries,
  runoverRow,
} from './src/app/allocation';
import { createMonthlyHeatMap, type MonthlyHeatMap } from './src/app/heat-map';
import type { ExplorerFilter } from './src/app/view-models';
import {
  createExplorerViewModel,
  createHomeViewModel,
} from './src/app/view-models';
import { initializeApplication } from './src/app/startup';
import type { Database } from './src/data/database';
import {
  importDemoData,
  loadLedgerSnapshot,
  queryLedgerTransactions,
  resetDemoData,
  updateMonthlyAllocation,
  type LedgerQueryResult,
  type LedgerSnapshot,
} from './src/data/demo-repository';
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
  createMonthlyBudget,
  type AllocationRatios,
} from './src/domain/budget';
import {
  BUDGET_SCOPES,
  EVENT_TYPES,
  SUPER_CATEGORY_KEYS,
  type BudgetScope,
  type EventType,
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
  parseLedgerSearch,
  type ParsedLedgerSearch,
} from './src/domain/search-parser';
import type {
  Category,
  ClassificationRule,
  ClassifiedTransaction,
} from './src/domain/types';

type LoadState =
  | { readonly status: 'LOADING' }
  | { readonly status: 'EMPTY' }
  | { readonly status: 'ERROR' }
  | { readonly status: 'READY'; readonly snapshot: LedgerSnapshot };

type Screen =
  | { readonly name: 'HOME' }
  | {
      readonly name: 'EXPLORER';
      readonly filter: ExplorerFilter;
      readonly unrecognizedTokens: readonly string[];
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

export default function App() {
  const palette = useColorScheme() === 'dark' ? DARK : LIGHT;
  const [database, setDatabase] = useState<Database | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'LOADING' });
  const [screen, setScreen] = useState<Screen>({ name: 'HOME' });
  const [queryState, setQueryState] = useState<QueryLoadState>({
    status: 'IDLE',
  });
  const [busyAction, setBusyAction] = useState<'LOAD' | 'RESET' | null>(null);

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
    ) => {
      if (database === null) {
        return;
      }
      setScreen({ name: 'EXPLORER', filter, unrecognizedTokens });
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
    async (filter: ExplorerFilter, currency: string, month: string) => {
      if (database === null) {
        return;
      }
      await refresh(database, month);
      await openExplorer(filter, currency);
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
        body="The local database could not be prepared. Restart the app to try again."
      />
    );
  }

  if (loadState.status === 'EMPTY') {
    return (
      <DemoEmptyState
        palette={palette}
        loading={busyAction === 'LOAD'}
        onLoad={loadDemo}
      />
    );
  }
  if (database === null) {
    return (
      <StateScreen
        palette={palette}
        title="Local ledger unavailable"
        body="The local database could not be prepared. Restart the app to try again."
      />
    );
  }

  const { snapshot } = loadState;
  if (snapshot.ledgerMonth === null) {
    return (
      <DemoEmptyState
        palette={palette}
        loading={busyAction === 'LOAD'}
        onLoad={loadDemo}
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
          onUpdateAllocation={updateAllocation}
          onReset={resetDemo}
        />
      ) : queryState.status === 'READY' ? (
        <ExplorerScreen
          database={database}
          palette={palette}
          filter={screen.filter}
          currency={budget.currency}
          queryResult={queryState.result}
          unrecognizedTokens={screen.unrecognizedTokens}
          onChangeFilter={(nextFilter) =>
            openExplorer(nextFilter, budget.currency)
          }
          onSearch={(parsed) =>
            openExplorer(
              parsed.query,
              budget.currency,
              parsed.unrecognizedTokens,
            )
          }
          onDataChanged={() =>
            refreshAfterCorrection(
              screen.filter,
              budget.currency,
              budget.monthKey,
            )
          }
          onBack={() => {
            setScreen({ name: 'HOME' });
            setQueryState({ status: 'IDLE' });
          }}
        />
      ) : (
        <QueryStateScreen palette={palette} status={queryState.status} />
      )}
    </SafeAreaView>
  );
}

function DemoEmptyState({
  palette,
  loading,
  onLoad,
}: {
  readonly palette: Palette;
  readonly loading: boolean;
  readonly onLoad: () => void;
}) {
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      <View style={styles.centered}>
        <Text style={[styles.demoPill, { color: palette.accent }]}>
          LOCAL DEMO DATA
        </Text>
        <Text style={[styles.heroTitle, { color: palette.text }]}>
          Explore the money model safely
        </Text>
        <Text style={[styles.heroBody, { color: palette.muted }]}>
          Load deterministic synthetic transactions into this device only. No
          Monzo connection, network request, account, or credential is used.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Load synthetic Demo Data"
          disabled={loading}
          onPress={onLoad}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 },
          ]}
          testID="demo-load"
        >
          {loading ? (
            <ActivityIndicator color={palette.accentText} />
          ) : (
            <Text
              style={[styles.primaryButtonText, { color: palette.accentText }]}
            >
              Load Demo Data
            </Text>
          )}
        </Pressable>
        <Text style={[styles.smallText, { color: palette.muted }]}>
          Import is idempotent. Reset removes only demo-owned records.
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
          <Text style={[styles.screenTitle, { color: palette.text }]}>
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

      <Text style={[styles.sectionKicker, { color: palette.accent }]}>
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

      <Text style={[styles.sectionKicker, { color: palette.accent }]}>
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
      <CoreNavigation
        active="HOME"
        palette={palette}
        onHome={() => undefined}
        onBreakdown={() => onExplore(monthQuery(budget.monthKey))}
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
      <View style={styles.weekRow}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <Text key={day} style={[styles.weekLabel, { color: palette.muted }]}>
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
            accessibilityLabel={`${formatActivityDate(day.date)}. ${formatMoney(money(day.amountMinor, currency), 'en-GB')}. ${day.status}. Open exact-date Breakdown.`}
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
          </Pressable>
        ))}
      </View>
      <View style={styles.heatLegend}>
        <View
          style={[
            styles.legendSwatch,
            { backgroundColor: palette.surfaceMuted },
          ]}
        />
        <Text style={[styles.legendText, { color: palette.muted }]}>£0</Text>
        <View
          style={[styles.legendGradientGreen, { backgroundColor: palette.fun }]}
        />
        <Text style={[styles.legendText, { color: palette.muted }]}>
          daily reference
        </Text>
        <View
          style={[
            styles.legendGradientRed,
            { backgroundColor: palette.breach },
          ]}
        />
        <Text style={[styles.legendText, { color: palette.muted }]}>
          monthly cap+
        </Text>
      </View>
    </View>
  );
}

function ExplorerScreen({
  database,
  palette,
  filter,
  currency,
  queryResult,
  unrecognizedTokens,
  onChangeFilter,
  onSearch,
  onDataChanged,
  onBack,
}: {
  readonly database: Database;
  readonly palette: Palette;
  readonly filter: ExplorerFilter;
  readonly currency: string;
  readonly queryResult: LedgerQueryResult;
  readonly unrecognizedTokens: readonly string[];
  readonly onChangeFilter: (filter: ExplorerFilter) => void;
  readonly onSearch: (parsed: ParsedLedgerSearch) => void;
  readonly onDataChanged: () => Promise<void>;
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
        accessibilityLabel="Back to Home"
        onPress={onBack}
        style={styles.backButton}
        testID="explorer-back"
      >
        <Text style={[styles.textButtonLabel, { color: palette.accent }]}>
          ← Home
        </Text>
      </Pressable>
      <Text style={[styles.demoPill, { color: palette.accent }]}>
        BREAKDOWN · LOCAL CORRECTIONS
      </Text>
      <Text style={[styles.screenTitle, { color: palette.text }]}>
        {viewModel.title}
      </Text>
      <Text style={[styles.bodyText, { color: palette.muted }]}>
        {viewModel.periodLabel} · {viewModel.transactionCountLabel}
      </Text>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Search local transactions"
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
  if (kind === 'SUPER_CATEGORY') {
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
          style={[
            styles.modalCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
          testID="rule-editor"
        >
          <Text style={[styles.cardTitle, { color: palette.text }]}>
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
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
}: {
  readonly palette: Palette;
  readonly status: Exclude<QueryLoadState, { status: 'READY' }>['status'];
}) {
  return (
    <View style={styles.centered}>
      {status === 'LOADING' ? (
        <ActivityIndicator color={palette.accent} size="large" />
      ) : null}
      <Text style={[styles.heroTitle, { color: palette.text }]}>
        {status === 'ERROR' ? 'Breakdown unavailable' : 'Loading Breakdown'}
      </Text>
      <Text style={[styles.heroBody, { color: palette.muted }]}>
        {status === 'ERROR'
          ? 'The local query could not be completed.'
          : 'Applying structured local filters.'}
      </Text>
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
}: {
  readonly active: 'HOME' | 'BREAKDOWN';
  readonly palette: Palette;
  readonly onHome: () => void;
  readonly onBreakdown: () => void;
}) {
  return (
    <View
      accessibilityLabel="Primary destinations"
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
      <Destination label="Trends" palette={palette} />
      <Destination label="Subscriptions" palette={palette} />
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
      accessibilityRole="button"
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
}: {
  readonly palette: Palette;
  readonly title: string;
  readonly body: string;
  readonly loading?: boolean;
}) {
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: palette.background }]}
    >
      <View style={styles.centered}>
        {loading ? (
          <ActivityIndicator color={palette.accent} size="large" />
        ) : null}
        <Text style={[styles.heroTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.heroBody, { color: palette.muted }]}>{body}</Text>
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
  sectionKicker: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  allocationHeader: {
    flexDirection: 'row',
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
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  identityRow: {
    flexDirection: 'row',
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
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
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
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryMetric: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 4,
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
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalSave: {
    minHeight: 48,
    minWidth: 90,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  heatMapPanel: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
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
    aspectRatio: 1,
    padding: 3,
  },
  calendarDay: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  breakdownTitleBlock: { flex: 1, gap: 8 },
  breakdownAmount: { alignItems: 'flex-end' },
  categoryTrack: { height: 7, borderRadius: 4, overflow: 'hidden' },
  categoryFill: { height: 7, borderRadius: 4 },
  treeTransaction: { borderTopWidth: 1, paddingTop: 10, gap: 5 },
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
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
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
    minHeight: 32,
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
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  choiceGroup: { gap: 7 },
  choiceButton: {
    minHeight: 44,
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
    alignItems: 'center',
    gap: 8,
  },
  ruleMain: { flex: 1, minHeight: 48, justifyContent: 'center' },
  ruleToggle: {
    minHeight: 44,
    minWidth: 76,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  coreNavigation: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 16,
    padding: 6,
    flexDirection: 'row',
  },
  destination: {
    flex: 1,
    minHeight: 54,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  destinationLabel: { fontSize: 11, fontWeight: '800' },
  destinationLater: { marginTop: 2, fontSize: 8, fontWeight: '800' },
});
