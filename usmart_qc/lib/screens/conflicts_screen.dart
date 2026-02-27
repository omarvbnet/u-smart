import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/conflicts_provider.dart';
import 'conflict_detail_screen.dart';
import 'ticket_detail_screen.dart';

class ConflictsScreen extends StatelessWidget {
  /// When true (e.g. used as tab), hides the app bar back button.
  final bool embedded;

  const ConflictsScreen({super.key, this.embedded = false});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: embedded
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                onPressed: () => Navigator.pop(context),
              ),
        automaticallyImplyLeading: !embedded,
        title: Text(
          l10n.t('conflict_cases'),
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 20,
          ),
        ),
      ),
      body: Consumer<ConflictsProvider>(
        builder: (context, provider, _) {
          if (provider.loading && provider.conflicts.isEmpty) {
            return const Center(
              child: CircularProgressIndicator(color: Color(0xFF6C63FF)),
            );
          }

          if (provider.conflicts.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFBBF24).withAlpha(15),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.gavel_rounded,
                          size: 56, color: Color(0xFFFBBF24)),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      l10n.t('no_conflicts'),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      l10n.t('no_conflicts_desc'),
                      style: TextStyle(
                        color: Colors.white.withAlpha(120),
                        fontSize: 14,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () => provider.fetchConflicts(),
            color: const Color(0xFF6C63FF),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              itemCount: provider.conflicts.length,
              itemBuilder: (context, index) {
                final c = provider.conflicts[index];
                return _ConflictCard(
                  conflict: c,
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ConflictDetailScreen(conflictId: c.id),
                    ),
                  ),
                  onTicketTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => TicketDetailScreen(ticketId: c.ticketId),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _ConflictCard extends StatelessWidget {
  final dynamic conflict;
  final VoidCallback onTap;
  final VoidCallback onTicketTap;

  const _ConflictCard({
    required this.conflict,
    required this.onTap,
    required this.onTicketTap,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isPending = conflict.isPending;
    final resultKey = _resultKey(conflict.inspectionResult);
    final resultLabel = l10n.t(resultKey);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF12122A),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isPending
                ? const Color(0xFFFBBF24).withAlpha(60)
                : Colors.white.withAlpha(15),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    conflict.siteName ?? conflict.ticketId,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: isPending
                        ? const Color(0xFFFBBF24).withAlpha(25)
                        : const Color(0xFF00D4AA).withAlpha(25),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    isPending ? l10n.t('pending') : l10n.t('resolved'),
                    style: TextStyle(
                      color: isPending
                          ? const Color(0xFFFBBF24)
                          : const Color(0xFF00D4AA),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${l10n.t('result')}: $resultLabel',
              style: TextStyle(
                color: Colors.white.withAlpha(150),
                fontSize: 13,
              ),
            ),
            if (conflict.assignedEngineerName != null) ...[
              const SizedBox(height: 4),
              Text(
                '${l10n.t('engineer')}: ${conflict.assignedEngineerName}',
                style: TextStyle(
                  color: Colors.white.withAlpha(100),
                  fontSize: 12,
                ),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                TextButton.icon(
                  onPressed: onTicketTap,
                  icon: const Icon(Icons.open_in_new_rounded,
                      size: 16, color: Color(0xFF6C63FF)),
                  label: Text(
                    l10n.t('details'),
                    style: const TextStyle(
                      color: Color(0xFF6C63FF),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                ),
                const Spacer(),
                Icon(Icons.arrow_forward_ios_rounded,
                    size: 12, color: Colors.white.withAlpha(80)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _resultKey(String r) {
    final lower = r.toLowerCase();
    if (lower == 'not_accepted') return 'not_accepted';
    if (lower == 'ncr') return 'ncr';
    if (lower == 'accepted_with_comments') return 'accepted_with_comments';
    return 'result';
  }
}
