import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../l10n/app_localizations.dart';
import '../models/site.dart';
import '../providers/locale_provider.dart';
import '../providers/sites_provider.dart';

/// Share owned site with a user account, or generate a date-limited public visitor URL.
Future<void> promptShareSite({
  required BuildContext context,
  required SitesProvider provider,
  required Site site,
  required AppLocalizations l10n,
}) async {
  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    builder: (ctx) => _SiteShareDialog(
      provider: provider,
      site: site,
      l10n: l10n,
    ),
  );
}

class _SiteShareDialog extends StatefulWidget {
  final SitesProvider provider;
  final Site site;
  final AppLocalizations l10n;

  const _SiteShareDialog({
    required this.provider,
    required this.site,
    required this.l10n,
  });

  @override
  State<_SiteShareDialog> createState() => _SiteShareDialogState();
}

class _SiteShareDialogState extends State<_SiteShareDialog>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  final _userCtrl = TextEditingController();
  bool includeTicketsUser = true;

  DateTime visitorFrom = DateTime.now();
  DateTime visitorUntil = DateTime.now().add(const Duration(days: 7));
  bool visitorIncludeTickets = false;
  bool visitorBusy = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this)..addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tabs.dispose();
    _userCtrl.dispose();
    super.dispose();
  }

  Future<DateTime?> _pickDateTime(DateTime initial) async {
    if (!mounted) return null;
    final d = await showDatePicker(
      context: context,
      initialDate: DateTime(initial.year, initial.month, initial.day),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 395)),
      builder: (ctx, child) =>
          Theme(data: ThemeData.dark(useMaterial3: true), child: child ?? const SizedBox.shrink()),
    );
    if (d == null) return null;
    if (!mounted) return null;
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
      builder: (ctx, child) =>
          Theme(data: ThemeData.dark(useMaterial3: true), child: child ?? const SizedBox.shrink()),
    );
    if (t == null) return null;
    return DateTime(d.year, d.month, d.day, t.hour, t.minute);
  }

  String _fmt(DateTime dt) =>
      DateFormat.yMMMd().add_jm().format(dt.toLocal());

  Future<void> _submitVisitor() async {
    if (visitorUntil.isBefore(visitorFrom.add(const Duration(minutes: 1)))) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.l10n.t('site_visitor_pick_dates')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
      return;
    }
    final nowPlus = DateTime.now().add(const Duration(minutes: 1));
    if (visitorUntil.isBefore(nowPlus)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.l10n.t('site_visitor_pick_dates')),
          backgroundColor: const Color(0xFFFF4757),
        ),
      );
      return;
    }
    final langCode = context.read<LocaleProvider>().locale.languageCode;
    setState(() => visitorBusy = true);
    final res = await widget.provider.createSiteVisitorLink(
      widget.site.id,
      visitorFrom,
      visitorUntil,
      includeTickets: visitorIncludeTickets,
    );
    if (!mounted) return;
    setState(() => visitorBusy = false);
    if (res['success'] == true && res['link'] is Map) {
      final link = res['link'] as Map;
      final urls = link['urls'];
      final lang = langCode;

      String url = '';
      if (urls is Map) {
        url = (urls[lang] as String?) ?? '';
        if (url.isEmpty) url = (urls['en'] as String?) ?? '';
        if (url.isEmpty) {
          for (final e in urls.values) {
            if (e is String && e.isNotEmpty) {
              url = e;
              break;
            }
          }
        }
      }

      await Clipboard.setData(ClipboardData(text: url));
      if (!mounted) return;

      Navigator.of(context).pop();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(widget.l10n.t('site_visitor_link_created')),
          backgroundColor: const Color(0xFF00D4AA),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    final msg =
        res['message'] is String ? res['message'] as String : widget.l10n.t('site_share_failed');
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg.isNotEmpty ? msg : widget.l10n.t('site_share_failed')),
        backgroundColor: const Color(0xFFFF4757),
      ),
    );
  }

  Future<void> _submitUser() async {
    final text = _userCtrl.text.trim();
    if (text.isEmpty) return;

    final messenger = ScaffoldMessenger.of(context);
    final err = await widget.provider.shareSite(
      widget.site.id,
      text,
      includeTickets: includeTicketsUser,
    );
    if (!mounted) return;
    Navigator.of(context).pop();
    messenger.showSnackBar(
      SnackBar(
        content: Text(err == null
            ? widget.l10n.t('site_share_ok')
            : (err.isNotEmpty ? err : widget.l10n.t('site_share_failed'))),
        backgroundColor:
            err == null ? const Color(0xFF00D4AA) : const Color(0xFFFF4757),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = widget.l10n;
    return AlertDialog(
      backgroundColor: const Color(0xFF12122A),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(
        l10n.t('site_share_title'),
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
      ),
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TabBar(
              controller: _tabs,
              indicatorColor: const Color(0xFF6C63FF),
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white54,
              tabs: [
                Tab(text: l10n.t('site_share_tab_user')),
                Tab(text: l10n.t('site_share_tab_visitor')),
              ],
            ),
            SizedBox(
              height: 320,
              child: TabBarView(
                controller: _tabs,
                children: [
                  SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const SizedBox(height: 14),
                        TextField(
                          controller: _userCtrl,
                          autofocus: true,
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(
                            hintText: l10n.t('site_share_hint'),
                            hintStyle:
                                TextStyle(color: Colors.white.withAlpha(120)),
                            filled: true,
                            fillColor: const Color(0xFF05051A),
                            border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          l10n.t('site_share_scope_title'),
                          style: TextStyle(
                            color: Colors.white.withAlpha(180),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            ChoiceChip(
                              label: Text(l10n.t('site_share_with_tickets')),
                              selected: includeTicketsUser,
                              onSelected: (_) =>
                                  setState(() => includeTicketsUser = true),
                              selectedColor:
                                  const Color(0xFF6C63FF).withAlpha(180),
                              labelStyle: TextStyle(
                                color: includeTicketsUser
                                    ? Colors.white
                                    : Colors.white.withAlpha(170),
                                fontSize: 13,
                              ),
                            ),
                            ChoiceChip(
                              label: Text(l10n.t('site_share_location_only')),
                              selected: !includeTicketsUser,
                              onSelected: (_) =>
                                  setState(() => includeTicketsUser = false),
                              selectedColor:
                                  const Color(0xFF6C63FF).withAlpha(180),
                              labelStyle: TextStyle(
                                color: !includeTicketsUser
                                    ? Colors.white
                                    : Colors.white.withAlpha(170),
                                fontSize: 13,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 20),
                      ],
                    ),
                  ),
                  SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 12),
                        Text(
                          l10n.t('site_visitor_intro'),
                          style:
                              TextStyle(color: Colors.white.withAlpha(150), height: 1.35, fontSize: 13),
                        ),
                        const SizedBox(height: 12),
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(l10n.t('site_visitor_valid_from'),
                              style:
                                  TextStyle(color: Colors.white.withAlpha(200))),
                          subtitle: Text(_fmt(visitorFrom),
                              style:
                                  const TextStyle(color: Color(0xFF8B83FF))),
                          trailing: IconButton(
                            icon: const Icon(Icons.edit_calendar_rounded,
                                color: Color(0xFF6C63FF)),
                            onPressed: () async {
                              final nt = await _pickDateTime(visitorFrom);
                              if (nt != null) setState(() => visitorFrom = nt);
                            },
                          ),
                        ),
                        ListTile(
                          dense: true,
                          contentPadding: EdgeInsets.zero,
                          title: Text(l10n.t('site_visitor_valid_until'),
                              style:
                                  TextStyle(color: Colors.white.withAlpha(200))),
                          subtitle: Text(_fmt(visitorUntil),
                              style:
                                  const TextStyle(color: Color(0xFF00D4AA))),
                          trailing: IconButton(
                            icon: const Icon(Icons.event_rounded,
                                color: Color(0xFF6C63FF)),
                            onPressed: () async {
                              final nt =
                                  await _pickDateTime(visitorUntil);
                              if (nt != null) setState(() => visitorUntil = nt);
                            },
                          ),
                        ),
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(
                            l10n.t('site_share_with_tickets'),
                            style:
                                TextStyle(color: Colors.white.withAlpha(220)),
                          ),
                          value: visitorIncludeTickets,
                          activeTrackColor:
                              const Color(0xFF6C63FF).withAlpha(180),
                          activeThumbColor: const Color(0xFFEDE9FE),
                          onChanged: (v) =>
                              setState(() => visitorIncludeTickets = v),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed:
              visitorBusy ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.t('cancel'),
              style: TextStyle(color: Colors.white.withAlpha(120))),
        ),
        if (_tabs.index == 0)
          ElevatedButton(
            onPressed: () => _submitUser(),
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6C63FF)),
            child: Text(l10n.t('site_share_action')),
          )
        else
          ElevatedButton(
            onPressed: visitorBusy ? null : () => _submitVisitor(),
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF6C63FF)),
            child: visitorBusy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white),
                  )
                : Text(l10n.t('site_visitor_create_link')),
          ),
      ],
    );
  }
}
