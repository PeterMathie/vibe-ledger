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
  createMonthlyBudget,
  type AllocationRatios,
} from './src/domain/budget';
import { formatMoney, money } from './src/domain/money';
import { dayQuery, monthQuery } from './src/domain/query';

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
    async (filter: ExplorerFilter, currency: string) => {
      if (database === null) {
        return;
      }
      setScreen({ name: 'EXPLORER', filter });
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
          palette={palette}
          filter={screen.filter}
          currency={budget.currency}
          queryResult={queryState.result}
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
        <View
          accessibilityLabel={viewModel.needsReviewLabel}
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
        </View>
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
  palette,
  filter,
  currency,
  queryResult,
  onBack,
}: {
  readonly palette: Palette;
  readonly filter: ExplorerFilter;
  readonly currency: string;
  readonly queryResult: LedgerQueryResult;
  readonly onBack: () => void;
}) {
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
        BREAKDOWN · READ ONLY
      </Text>
      <Text style={[styles.screenTitle, { color: palette.text }]}>
        {viewModel.title}
      </Text>
      <Text style={[styles.bodyText, { color: palette.muted }]}>
        {viewModel.periodLabel} · {viewModel.transactionCountLabel}
      </Text>
      <QueryChips filter={filter} palette={palette} />

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
                  {superCategory.percentageLabel} of allocation activity
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
                        {item.percentageLabel}
                      </Text>
                    </View>
                  </View>
                  {item.transactions.map((transaction) => (
                    <TransactionTreeRow
                      key={`${item.key}:${transaction.id}`}
                      transaction={transaction}
                      palette={palette}
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
            />
          ))}
        </View>
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
}: {
  readonly filter: ExplorerFilter;
  readonly palette: Palette;
}) {
  const labels = [
    filter.date.kind === 'MONTH'
      ? `Month ${filter.date.month}`
      : filter.date.kind === 'DAY'
        ? `Day ${filter.date.date}`
        : `${filter.date.startDate} to ${filter.date.endDate}`,
    ...(filter.superCategories ?? []).map(
      (key) => ({ LIVING: 'Living', SAVING: 'Saving', FUN: 'Fun' })[key],
    ),
    ...(filter.categoryIds ?? []).map((id) => `Category ${id}`),
    ...(filter.eventTypes ?? []).map((type) => `Type ${type}`),
    ...(filter.scopes ?? []).map((scope) => `Scope ${scope}`),
    ...(filter.merchant === undefined
      ? []
      : [`Merchant contains ${filter.merchant}`]),
    ...(filter.amount === undefined
      ? []
      : [
          `${filter.amount.comparator} ${filter.amount.thresholdMinor} minor units`,
        ]),
  ];
  return (
    <View accessibilityLabel="Active structured filters" style={styles.chipRow}>
      {labels.map((label) => (
        <View
          key={label}
          style={[
            styles.filterChip,
            {
              backgroundColor: palette.surfaceMuted,
              borderColor: palette.border,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: palette.text }]}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
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
}: {
  readonly transaction: ReturnType<
    typeof createExplorerViewModel
  >['transactions'][number];
  readonly palette: Palette;
}) {
  return (
    <View
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
    </View>
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
  filterChip: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 999,
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
