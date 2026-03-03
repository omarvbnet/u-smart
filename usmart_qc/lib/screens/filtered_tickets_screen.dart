import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../models/ticket.dart';
import '../widgets/ticket_card.dart';
import 'ticket_detail_screen.dart';

/// Shows tickets filtered by a stats card (e.g. Within SLA, NCR, Accepted).
class FilteredTicketsScreen extends StatelessWidget {
  final String title;
  final List<Ticket> tickets;

  const FilteredTicketsScreen({
    super.key,
    required this.title,
    required this.tickets,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: const Color(0xFF05051A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          title,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      body: tickets.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.assignment_outlined,
                    size: 64,
                    color: Colors.white.withAlpha(80),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    l10n.t('no_tickets'),
                    style: TextStyle(
                      color: Colors.white.withAlpha(160),
                      fontSize: 16,
                    ),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: tickets.length,
              itemBuilder: (context, index) {
                final ticket = tickets[index];
                return TicketCard(
                  ticket: ticket,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => TicketDetailScreen(ticketId: ticket.id),
                    ),
                  ),
                  onAssign: null,
                );
              },
            ),
    );
  }
}
