import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';

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
  resetDemoData,
  type LedgerSnapshot,
} from './src/data/demo-repository';
import { formatMoney, money } from './src/domain/money';

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
          palette={palette}
          budget={budget}
          summary={summary}
          transactions={transactions}
          months={snapshot.months}
          activeMonth={snapshot.activeMonth ?? budget.monthKey}
          busy={busyAction !== null}
          onSelectMonth={selectMonth}
          onExplore={(filter) => setScreen({ name: 'EXPLORER', filter })}
          onReset={resetDemo}
        />
      ) : (
        <ExplorerScreen
          palette={palette}
          filter={screen.filter}
          currency={budget.currency}
          transactions={snapshot.ledgerMonth.resolutionTransactions}
          onBack={() => setScreen({ name: 'HOME' })}
        />
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
  readonly onReset: () => void;
}) {
  const viewModel = useMemo(
    () => createHomeViewModel(budget, summary, transactions),
    [budget, summary, transactions],
  );
  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Monthly allocation. Budget base ${viewModel.budgetBaseLabel}. ${viewModel.allocationLabel}. Open all transactions for ${viewModel.monthLabel}.`}
        onPress={() => onExplore({ month: budget.monthKey })}
        style={[
          styles.allocationPanel,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
        testID="budget-base-drilldown"
      >
        <View style={styles.allocationHeader}>
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
        </View>
        <View
          accessibilityLabel={viewModel.allocationLabel}
          style={[styles.allocationTrack, { backgroundColor: palette.border }]}
        >
          {viewModel.cards.map((card) => (
            <View
              key={card.key}
              style={{
                flex: card.ratioBasisPoints,
                backgroundColor: categoryColor(card.key, palette),
              }}
            />
          ))}
        </View>
        {viewModel.cards.map((card) => (
          <View key={card.key} style={styles.allocationRow}>
            <View style={styles.identityRow}>
              <View
                style={[
                  styles.identityDot,
                  { backgroundColor: categoryColor(card.key, palette) },
                ]}
              />
              <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
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
      </Pressable>

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
            onPress={() => onExplore(card.filter)}
          />
        ))}
      </View>

      <Text style={[styles.sectionKicker, { color: palette.accent }]}>
        RECENT PACE
      </Text>
      <Text style={[styles.bodyText, { color: palette.muted }]}>
        Included Living and Fun activity. Full calendar pacing arrives in the
        Heat Map layer.
      </Text>
      <View
        style={[
          styles.activityList,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        {Object.entries(summary.dailyIncludedSpendMinor)
          .slice(0, 5)
          .map(([date, amountMinor]) => (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`Open spending on ${date}`}
              onPress={() => onExplore({ month: budget.monthKey, date })}
              style={[
                styles.activityRow,
                { borderBottomColor: palette.border },
              ]}
              testID={`day-${date}`}
            >
              <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
                {formatActivityDate(date)}
              </Text>
              <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
                {formatMoney(money(amountMinor, budget.currency), 'en-GB')}
              </Text>
            </Pressable>
          ))}
      </View>
      <CoreNavigation
        active="HOME"
        palette={palette}
        onHome={() => undefined}
        onBreakdown={() => onExplore({ month: budget.monthKey })}
      />
    </ScrollView>
  );
}

function BudgetCard({
  card,
  palette,
  onPress,
}: {
  readonly card: ReturnType<typeof createHomeViewModel>['cards'][number];
  readonly palette: Palette;
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
      <View
        accessibilityLabel={`${card.percentageLabel} of target`}
        style={[styles.track, { backgroundColor: palette.surfaceMuted }]}
      >
        <View
          style={[
            styles.progress,
            {
              width: `${progressWidth}%`,
              backgroundColor: card.isOver ? palette.breach : identityColor,
            },
          ]}
        />
      </View>
      {card.secondaryLabel === undefined ? null : (
        <Text style={[styles.smallText, { color: palette.warning }]}>
          {card.secondaryLabel}
        </Text>
      )}
    </Pressable>
  );
}

function ExplorerScreen({
  palette,
  filter,
  currency,
  transactions,
  onBack,
}: {
  readonly palette: Palette;
  readonly filter: ExplorerFilter;
  readonly currency: string;
  readonly transactions: NonNullable<
    LedgerSnapshot['ledgerMonth']
  >['transactions'];
  readonly onBack: () => void;
}) {
  const viewModel = useMemo(
    () => createExplorerViewModel(transactions, filter, currency),
    [currency, filter, transactions],
  );
  const categorizedIds = new Set(
    viewModel.breakdown.flatMap((item) =>
      item.transactions.map((transaction) => transaction.id),
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
      {viewModel.breakdown.length === 0 ? (
        <Text style={[styles.bodyText, { color: palette.muted }]}>
          No category budget effects for this filter.
        </Text>
      ) : (
        viewModel.breakdown.map((item) => (
          <View
            key={item.key}
            style={[
              styles.breakdownGroup,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View style={styles.breakdownHeader}>
              <View style={styles.breakdownTitleBlock}>
                <Text style={[styles.cardTitle, { color: palette.text }]}>
                  {item.label}
                </Text>
                <View
                  accessibilityLabel={`${item.percentageLabel} of this breakdown`}
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
                        backgroundColor: explorerAccent(filter, palette),
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.breakdownAmount}>
                <Text style={[styles.bodyTextStrong, { color: palette.text }]}>
                  {item.amountLabel}
                </Text>
                <Text style={[styles.smallText, { color: palette.muted }]}>
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

function explorerAccent(filter: ExplorerFilter, palette: Palette): string {
  if (filter.superCategory === 'LIVING') {
    return palette.living;
  }
  if (filter.superCategory === 'SAVING') {
    return palette.saving;
  }
  return filter.superCategory === 'FUN' ? palette.fun : palette.accent;
}

function formatActivityDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
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
