/** In-app + FCM copy for requester notifications (en, ar, tr, ku). */

export type AppNotificationLocale = 'en' | 'ar' | 'tr' | 'ku';

export type NotificationCopyKey =
  | 'new_ticket_role'
  | 'ticket_status_updated'
  | 'staff_assigned'
  | 'ticket_completed'
  | 'ticket_ncr_raised'
  | 'comment_engineer_reply'
  | 'comment_company_reply'
  | 'visitor_status'
  | 'visitor_resubmit'
  | 'reinspect_requested'
  | 'ncr_resubmitted'
  | 'ncr_approved_reinspect'
  | 'ncr_rework'
  | 'site_shared_received'
  | 'conflict_resolved'
  | 'conflict_reinspection'
  | 'workspace_announcement'
  | 'material_assigned'
  | 'material_used'
  | 'material_request_created'
  | 'material_request_updated'
  | 'material_request_receipt_disputed'
  | 'material_request_issue_acknowledged'
  | 'maintenance_crew_joined'
  | 'maintenance_awaiting_your_confirm'
  | 'ticket_cancellation_requested'
  | 'ticket_cancellation_approved'
  | 'ticket_cancellation_rejected'
  | 'ticket_resubmit_to_requester'
  | 'ticket_resubmit_to_staff'
  | 'maintenance_rejected_by_requester';

export type NotificationCopyPayload = {
  key: NotificationCopyKey;
  vars?: Record<string, string>;
};

const STATUS_LABEL: Record<AppNotificationLocale, Record<string, string>> = {
  en: {
    ON_SITE: 'On site',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    PENDING: 'Pending',
    CANCELLED: 'Cancelled',
  },
  ar: {
    ON_SITE: 'في الموقع',
    IN_PROGRESS: 'قيد التنفيذ',
    COMPLETED: 'مكتمل',
    PENDING: 'قيد الانتظار',
    CANCELLED: 'ملغى',
  },
  tr: {
    ON_SITE: 'Sahada',
    IN_PROGRESS: 'Devam ediyor',
    COMPLETED: 'Tamamlandı',
    PENDING: 'Beklemede',
    CANCELLED: 'İptal edildi',
  },
  ku: {
    ON_SITE: 'لە شوێنەکە',
    IN_PROGRESS: 'لە کاردایە',
    COMPLETED: 'تەواو بوو',
    PENDING: 'چاوەڕوان',
    CANCELLED: 'هەڵوەشێنراوە',
  },
};

const RESULT_LABEL: Record<AppNotificationLocale, Record<string, string>> = {
  en: {
    accepted: 'Accepted',
    accepted_with_comments: 'Accepted with comments',
    not_accepted: 'Not accepted',
    ncr: 'NCR',
  },
  ar: {
    accepted: 'مقبول',
    accepted_with_comments: 'مقبول مع ملاحظات',
    not_accepted: 'غير مقبول',
    ncr: 'NCR',
  },
  tr: {
    accepted: 'Kabul edildi',
    accepted_with_comments: 'Yorumlarla kabul edildi',
    not_accepted: 'Kabul edilmedi',
    ncr: 'NCR',
  },
  ku: {
    accepted: 'قبووڵ کرا',
    accepted_with_comments: ' بە لێدووانەوە قبووڵ کرا',
    not_accepted: ' قبووڵ نەکراوە',
    ncr: 'NCR',
  },
};

const MATERIAL_REQUEST_STATUS_LABEL: Record<AppNotificationLocale, Record<string, string>> = {
  en: {
    PENDING: 'Pending',
    ACCEPTED: 'Accepted',
    REJECTED: 'Rejected',
    AWAITING_RECEIPT: 'Awaiting your confirmation',
    FULFILLED: 'Fulfilled',
    CANCELLED: 'Cancelled',
  },
  ar: {
    PENDING: 'قيد الانتظار',
    ACCEPTED: 'مقبول',
    REJECTED: 'مرفوض',
    AWAITING_RECEIPT: 'بانتظار تأكيد الاستلام',
    FULFILLED: 'مكتمل',
    CANCELLED: 'ملغى',
  },
  tr: {
    PENDING: 'Beklemede',
    ACCEPTED: 'Kabul edildi',
    REJECTED: 'Reddedildi',
    AWAITING_RECEIPT: 'Teslim onayı bekleniyor',
    FULFILLED: 'Karşılandı',
    CANCELLED: 'İptal edildi',
  },
  ku: {
    PENDING: 'چاوەڕوان',
    ACCEPTED: 'قبووڵ کرا',
    REJECTED: 'ڕەتکرایەوە',
    AWAITING_RECEIPT: 'چاوەڕوانی پشتڕاستکردنەوەی وەرگرتن',
    FULFILLED: 'جێبەجێ کرا',
    CANCELLED: 'هەڵوەشێنرایەوە',
  },
};

/** Maps template + vars → title + body for one locale */
const TEMPLATES: Record<
  NotificationCopyKey,
  Record<AppNotificationLocale, (v: Record<string, string>) => { title: string; body: string }>
> = {
  new_ticket_role: {
    en: (v) => ({
      title: 'New ticket available',
      body:
        v.roleKind === 'maintenance'
          ? `New maintenance ticket in ${v.province}: ${v.siteName}`
          : `New QC ticket in ${v.province}: ${v.siteName}`,
    }),
    ar: (v) => ({
      title: 'تذكرة جديدة متاحة',
      body:
        v.roleKind === 'maintenance'
          ? `تذكرة صيانة جديدة في ${v.province}: ${v.siteName}`
          : `تذكرة مراقبة جودة جديدة في ${v.province}: ${v.siteName}`,
    }),
    tr: (v) => ({
      title: 'Yeni talep uygun',
      body:
        v.roleKind === 'maintenance'
          ? `${v.province} için yeni bakım talebi: ${v.siteName}`
          : `${v.province} için yeni KK talebi: ${v.siteName}`,
    }),
    ku: (v) => ({
      title: 'تیکەتی نوێ بەردەستە',
      body:
        v.roleKind === 'maintenance'
          ? `تیکەتی چاککردنی نوێ لە ${v.province}: ${v.siteName}`
          : `تیکەتی کۆنتڕۆڵی جۆری نوێ لە ${v.province}: ${v.siteName}`,
    }),
  },
  ticket_status_updated: {
    en: (v) => {
      const label = STATUS_LABEL.en[v.statusKey] ?? v.statusKey;
      return {
        title: 'Ticket status updated',
        body: `Your ticket status is now: ${label}`,
      };
    },
    ar: (v) => ({
      title: 'تحديث حالة التذكرة',
      body: `حالة تذكرتك الآن: ${STATUS_LABEL.ar[v.statusKey] ?? v.statusKey}`,
    }),
    tr: (v) => ({
      title: 'Talep durumu güncellendi',
      body: `Talebinizin durumu: ${STATUS_LABEL.tr[v.statusKey] ?? v.statusKey}`,
    }),
    ku: (v) => ({
      title: 'بارەی تیکەت نوێکرایەوە',
      body: `بارەی تیکەتەکەت ئێستا: ${STATUS_LABEL.ku[v.statusKey] ?? v.statusKey}`,
    }),
  },
  staff_assigned: {
    en: (v) => {
      const kind = v.staffKind === 'technician' ? 'Technician' : 'Engineer';
      return {
        title: `${kind} assigned`,
        body: `${kind} ${v.assigneeName} has been assigned to your ticket`,
      };
    },
    ar: (v) => ({
      title: v.staffKind === 'technician' ? 'تم تعيين فني' : 'تم تعيين مهندس',
      body: `${
        v.staffKind === 'technician' ? 'الفني' : 'المهندس'
      } ${v.assigneeName} عُيِّن على تذكرتك`,
    }),
    tr: (v) => ({
      title: v.staffKind === 'technician' ? 'Teknisyen atandı' : 'Mühendis atandı',
      body: `${v.assigneeName} talebinize atandı`,
    }),
    ku: (v) => ({
      title: v.staffKind === 'technician' ? 'تەکنیسین کرایەتە' : 'ئەندازیار کرایەتە',
      body: `${v.assigneeName} کرایەتە سەر تیکەتەکەت`,
    }),
  },
  ticket_completed: {
    en: (v) => {
      const rk = v.resultKey || '';
      const rt = rk ? RESULT_LABEL.en[rk] ?? rk : '';
      return {
        title: 'Ticket completed',
        body: rt ? `Your ticket has been completed — Result: ${rt}` : 'Your ticket has been completed',
      };
    },
    ar: (v) => {
      const rk = v.resultKey || '';
      const rt = rk ? RESULT_LABEL.ar[rk] ?? rk : '';
      return {
        title: 'اكتمال التذكرة',
        body: rt ? `اكتملت تذكرتك — النتيجة: ${rt}` : 'اكتملت تذكرتك',
      };
    },
    tr: (v) => {
      const rk = v.resultKey || '';
      const rt = rk ? RESULT_LABEL.tr[rk] ?? rk : '';
      return {
        title: 'Talep tamamlandı',
        body: rt ? `Talebiniz tamamlandı — Sonuç: ${rt}` : 'Talebiniz tamamlandı',
      };
    },
    ku: (v) => {
      const rk = v.resultKey || '';
      const rt = rk ? RESULT_LABEL.ku[rk] ?? rk : '';
      return {
        title: 'تیکەت تەواو بوو',
        body: rt ? `تیکەتەکەت تەواو بوو — ئەنجام: ${rt}` : 'تیکەتەکەت تەواو بوو',
      };
    },
  },
  ticket_ncr_raised: {
    en: () => ({
      title: 'NCR raised',
      body: 'An NCR has been raised on your ticket. Please resubmit with corrective action.',
    }),
    ar: () => ({
      title: 'تم رفع بلاغ عدم مطابقة',
      body: 'تم رفع تقرير NCR على تذكرتك. يرجى إعادة الإرسال مع الإجراءات التصحيحية.',
    }),
    tr: () => ({
      title: 'NCR bildirildi',
      body: 'Talebiniz için bir NCR oluşturuldu. Lütfen düzeltici aksiyonla yeniden gönderin.',
    }),
    ku: () => ({
      title: 'NCR تۆمار کرا',
      body: 'NCR بۆ تیکەتەکەت دەردەکەوێت تکایە دووبارەی بنێرەوە لەگەڵ کارکردنی چاککردنەوە.',
    }),
  },
  comment_engineer_reply: {
    en: (v) => ({
      title: 'New comment on your ticket',
      body: `${v.authorName} replied on the ticket`,
    }),
    ar: (v) => ({
      title: 'تعليق جديد على تذكرتك',
      body: `${v.authorName} رد على التذكرة`,
    }),
    tr: (v) => ({
      title: 'Talebinize yeni yorum',
      body: `${v.authorName} talebe yanıt verdi`,
    }),
    ku: (v) => ({
      title: 'لێدوانێکی نوێ لە تیکەتەکەت',
      body: `${v.authorName} وەڵامی تیکەتەکەی دا`,
    }),
  },
  comment_company_reply: {
    en: (v) => ({
      title: 'Company replied on ticket',
      body: `${v.authorName} replied on the ticket`,
    }),
    ar: (v) => ({
      title: 'رد الشركة على التذكرة',
      body: `${v.authorName} رد على التذكرة`,
    }),
    tr: (v) => ({
      title: 'Şirket talebe yanıt verdi',
      body: `${v.authorName} yanıtladı`,
    }),
    ku: (v) => ({
      title: 'کۆمپانیا وەڵامی تیکەتەکانی دا',
      body: `${v.authorName} وەڵامی دا`,
    }),
  },
  visitor_status: {
    en: (v) => ({
      title: 'Ticket status updated',
      body: `Your ticket status is now: ${STATUS_LABEL.en[v.statusKey] ?? v.statusKey}`,
    }),
    ar: (v) => ({
      title: 'تحديث حالة التذكرة',
      body: `حالة تذكرتك الآن: ${STATUS_LABEL.ar[v.statusKey] ?? v.statusKey}`,
    }),
    tr: (v) => ({
      title: 'Talep durumu güncellendi',
      body: `Talebinizin durumu: ${STATUS_LABEL.tr[v.statusKey] ?? v.statusKey}`,
    }),
    ku: (v) => ({
      title: 'بارەی تیکەت نوێکرایەوە',
      body: `بارەی تیکەتەکەت ئێستا: ${STATUS_LABEL.ku[v.statusKey] ?? v.statusKey}`,
    }),
  },
  visitor_resubmit: {
    en: (v) => ({
      title: 'Resubmit for edit',
      body: `Admin sent your request back for edit. Reason: ${v.reason}`,
    }),
    ar: (v) => ({
      title: 'إعادة الإرسال للتعديل',
      body: `أعاد المسؤول طلبك للتعديل. السبب: ${v.reason}`,
    }),
    tr: (v) => ({
      title: 'Düzenleme için yeniden gönder',
      body: `Yönetici talebinizi düzenlemeye gönderdi. Neden: ${v.reason}`,
    }),
    ku: (v) => ({
      title: 'دووبارە بنێرە بۆ دەستکاریکردن',
      body: `بەرپرسیار داواکارییەکەت گەڕاندەوە بۆ دەستکاریکردن. هۆکار: ${v.reason}`,
    }),
  },
  reinspect_requested: {
    en: () => ({
      title: 'Re-inspection requested',
      body: 'This ticket has been sent back for re-inspection.',
    }),
    ar: () => ({
      title: 'طلب إعادة فحص',
      body: 'أُعيدت هذه التذكرة لإعادة الفحص.',
    }),
    tr: () => ({
      title: 'Yeniden denetim istendi',
      body: 'Bu talep yeniden kontrol için geri gönderildi.',
    }),
    ku: () => ({
      title: 'دووبارە پشکنین داواکراوە',
      body: 'ئەم تیکەتە بۆ پشکنینی دووبارە نێردرایەوە.',
    }),
  },
  ncr_resubmitted: {
    en: (v) => ({
      title: 'NCR resubmitted',
      body: `Requester resubmitted NCR for ${v.siteName}. Review and respond.`,
    }),
    ar: (v) => ({
      title: 'إعادة إرسال NCR',
      body: `أعاد الطالب إرسال NCR لـ ${v.siteName}. راجع وأجب.`,
    }),
    tr: (v) => ({
      title: 'NCR yeniden gönderildi',
      body: `Talep eden ${v.siteName} için NCR’yi yeniden gönderdi. İnceleyin.`,
    }),
    ku: (v) => ({
      title: 'NCR دووبارە نێردرایەوە',
      body: `داواکار NCR ی دووبارە نارد بۆ ${v.siteName}. پشکنە و وەڵام بدەرەوە.`,
    }),
  },
  ncr_approved_reinspect: {
    en: () => ({
      title: 'NCR approved — re-inspection',
      body: 'Your NCR resubmission was approved. The engineer will re-inspect.',
    }),
    ar: () => ({
      title: 'قبول NCR — إعادة الفحص',
      body: 'تم قبول إعادة إرسالك. سيُعاد فحص التذكرة.',
    }),
    tr: () => ({
      title: 'NCR onaylandı — yeniden denetim',
      body: 'NCR yeniden gönderiminiz onaylandı. Mühendis yeniden kontrol edecek.',
    }),
    ku: () => ({
      title: 'NCR قبووڵ کرا — پشکنینی دووبارە',
      body: 'دووبارەناردنەوەکەت قبووڵ کرا. ئەندازیار دووبارە دەپشکنێت.',
    }),
  },
  ncr_rework: {
    en: (v) => ({
      title: 'NCR rework requested',
      body: v.comment?.trim()
        ? `Engineer requested rework: ${v.comment}`
        : 'Engineer requested rework. Please fix and resubmit.',
    }),
    ar: (v) => ({
      title: 'طلب إعادة تنفيذ NCR',
      body: v.comment?.trim()
        ? `طلب المهندس إعادة العمل: ${v.comment}`
        : 'طلب المهندس إعادة العمل. يرجى الإصلاح وإعادة الإرسال.',
    }),
    tr: (v) => ({
      title: 'NCR için yeniden iş istendi',
      body: v.comment?.trim()
        ? `Mühendis yeniden iş istedi: ${v.comment}`
        : 'Mühendis düzeltme istedi. Lütfen yeniden gönderin.',
    }),
    ku: (v) => ({
      title: 'کارکردنەوەی NCR داواکراوە',
      body: v.comment?.trim()
        ? `ئەندازیار کارکردنەوەی داواکرد: ${v.comment}`
        : 'ئەندازیار کارکردنەوەی داواکرد تکایە چاک بکەوە و دووبارە بنێرە.',
    }),
  },
  site_shared_received: {
    en: (v) => ({
      title: 'Site shared with you',
      body:
        v.accessMode === 'tickets'
          ? `${v.fromName} shared site ${v.siteLabel} — you have access including linked tickets (Provisor app).`
          : `${v.fromName} shared site ${v.siteLabel} — location details only.`,
    }),
    ar: (v) => ({
      title: 'تمت مشاركة موقع معك',
      body:
        v.accessMode === 'tickets'
          ? `شاركك ${v.fromName} الموقع ${v.siteLabel} — لديك وصول مع التذاكر المرتبطة (تطبيق Provisor).`
          : `شاركك ${v.fromName} الموقع ${v.siteLabel} — تفاصيل الموقع فقط.`,
    }),
    tr: (v) => ({
      title: 'Bir site sizinle paylaşıldı',
      body:
        v.accessMode === 'tickets'
          ? `${v.fromName}, ${v.siteLabel} sitesini paylaştı — bağlı talepler dahil erişiminiz var (Provisor uygulaması).`
          : `${v.fromName}, ${v.siteLabel} sitesini paylaştı — yalnızca konum bilgisi.`,
    }),
    ku: (v) => ({
      title: 'شوێنێک بۆتەوە هاوبەش کرا',
      body:
        v.accessMode === 'tickets'
          ? `${v.fromName} شوێن ${v.siteLabel} بۆتەوە هاوبەش کرد — دەستڕاگەیشتن بۆ تیکەتە بەستراوەکان (ئەپی Provisor).`
          : `${v.fromName} شوێن ${v.siteLabel} بۆتەوە هاوبەش کرد — وردەکاری شوێنەکە بە تەنها.`,
    }),
  },
  conflict_resolved: {
    en: (v) => {
      const label = RESULT_LABEL.en[v.resultKey] ?? v.resultKey;
      return {
        title: 'Conflict resolved by admin',
        body: v.siteName
          ? `Admin resolved the conflict on "${v.siteName}". Final result: ${label}.`
          : `Admin resolved the conflict on this ticket. Final result: ${label}.`,
      };
    },
    ar: (v) => {
      const label = RESULT_LABEL.ar[v.resultKey] ?? v.resultKey;
      return {
        title: 'تمت تسوية النزاع من قِبل الإدارة',
        body: v.siteName
          ? `قامت الإدارة بتسوية النزاع على "${v.siteName}". النتيجة النهائية: ${label}.`
          : `قامت الإدارة بتسوية النزاع على هذه التذكرة. النتيجة النهائية: ${label}.`,
      };
    },
    tr: (v) => {
      const label = RESULT_LABEL.tr[v.resultKey] ?? v.resultKey;
      return {
        title: 'Anlaşmazlık yönetici tarafından çözüldü',
        body: v.siteName
          ? `Yönetici "${v.siteName}" üzerindeki anlaşmazlığı çözdü. Nihai sonuç: ${label}.`
          : `Yönetici bu bildirimdeki anlaşmazlığı çözdü. Nihai sonuç: ${label}.`,
      };
    },
    ku: (v) => {
      const label = RESULT_LABEL.ku[v.resultKey] ?? v.resultKey;
      return {
        title: 'ململانێ لەلایەن بەڕێوەبەرەوە چارەسەر کرا',
        body: v.siteName
          ? `بەڕێوەبەر ململانێی سەر "${v.siteName}"ی چارەسەر کرد. ئەنجامی کۆتایی: ${label}.`
          : `بەڕێوەبەر ململانێی ئەم تیکەتە چارەسەر کرد. ئەنجامی کۆتایی: ${label}.`,
      };
    },
  },
  conflict_reinspection: {
    en: (v) => ({
      title: 'Re-inspection ordered',
      body: v.siteName
        ? `Admin sent "${v.siteName}" back for re-inspection. The ticket is now in progress.`
        : 'Admin sent this ticket back for re-inspection. The ticket is now in progress.',
    }),
    ar: (v) => ({
      title: 'تم طلب إعادة الفحص',
      body: v.siteName
        ? `أعادت الإدارة "${v.siteName}" لإعادة الفحص. التذكرة الآن قيد التنفيذ.`
        : 'أعادت الإدارة هذه التذكرة لإعادة الفحص. التذكرة الآن قيد التنفيذ.',
    }),
    tr: (v) => ({
      title: 'Yeniden denetim istendi',
      body: v.siteName
        ? `Yönetici "${v.siteName}" için yeniden denetim istedi. Talep şu an devam ediyor.`
        : 'Yönetici bu talep için yeniden denetim istedi. Talep şu an devam ediyor.',
    }),
    ku: (v) => ({
      title: 'دووبارە پشکنین داواکراوە',
      body: v.siteName
        ? `بەڕێوەبەر "${v.siteName}"ی نێردەوە بۆ دووبارە پشکنین. تیکەتەکە ئێستا لە کاردایە.`
        : 'بەڕێوەبەر ئەم تیکەتە نێردەوە بۆ دووبارە پشکنین. تیکەتەکە ئێستا لە کاردایە.',
    }),
  },
  material_assigned: {
    en: (v) => ({
      title: 'Material assigned to you',
      body: `${v.materialName} — S/N ${v.serialNumber} (${v.province}).`,
    }),
    ar: (v) => ({
      title: 'تم تعيين مادة لك',
      body: `${v.materialName} — الرقم ${v.serialNumber} (${v.province}).`,
    }),
    tr: (v) => ({
      title: 'Size malzeme atandı',
      body: `${v.materialName} — Seri no ${v.serialNumber} (${v.province}).`,
    }),
    ku: (v) => ({
      title: 'کەرەستەیەک بۆ تۆ دیاریکرا',
      body: `${v.materialName} — ژمارەی زنجیرەیی ${v.serialNumber} (${v.province}).`,
    }),
  },
  material_used: {
    en: (v) => ({
      title: 'Material used on ticket',
      body: `${v.materialName} (S/N ${v.serialNumber}) recorded on: ${v.ticketLabel}.`,
    }),
    ar: (v) => ({
      title: 'استخدام مادة على تذكرة',
      body: `${v.materialName} (رقم ${v.serialNumber}) سُجّل على: ${v.ticketLabel}.`,
    }),
    tr: (v) => ({
      title: 'Malzeme talepte kullanıldı',
      body: `${v.materialName} (Seri ${v.serialNumber}) şu talebe yazıldı: ${v.ticketLabel}.`,
    }),
    ku: (v) => ({
      title: 'کەرەستە لەسەر تیکەت بەکارهێنرا',
      body: `${v.materialName} (زنجیرە ${v.serialNumber}) تۆمارکرا لە: ${v.ticketLabel}.`,
    }),
  },
  material_request_created: {
    en: (v) => ({
      title: 'New material request',
      body: v.summary
        ? `${v.requesterLabel}: ${v.summary}`
        : `${v.requesterLabel} submitted a material request.`,
    }),
    ar: (v) => ({
      title: 'طلب مواد جديد',
      body: v.summary
        ? `${v.requesterLabel}: ${v.summary}`
        : `${v.requesterLabel} أرسل طلب مواد.`,
    }),
    tr: (v) => ({
      title: 'Yeni malzeme talebi',
      body: v.summary
        ? `${v.requesterLabel}: ${v.summary}`
        : `${v.requesterLabel} malzeme talebi gönderdi.`,
    }),
    ku: (v) => ({
      title: 'داواکاری کەرەستەی نوێ',
      body: v.summary
        ? `${v.requesterLabel}: ${v.summary}`
        : `${v.requesterLabel} داواکاری کەرەستەی نارد.`,
    }),
  },
  material_request_updated: {
    en: (v) => ({
      title: 'Your material request was updated',
      body: `Status: ${MATERIAL_REQUEST_STATUS_LABEL.en[v.status] ?? v.status}.`,
    }),
    ar: (v) => ({
      title: 'تم تحديث طلب المواد',
      body: `الحالة: ${MATERIAL_REQUEST_STATUS_LABEL.ar[v.status] ?? v.status}.`,
    }),
    tr: (v) => ({
      title: 'Malzeme talebiniz güncellendi',
      body: `Durum: ${MATERIAL_REQUEST_STATUS_LABEL.tr[v.status] ?? v.status}.`,
    }),
    ku: (v) => ({
      title: 'داواکاری کەرەستەکەت نوێکرایەوە',
      body: `دۆخ: ${MATERIAL_REQUEST_STATUS_LABEL.ku[v.status] ?? v.status}.`,
    }),
  },
  material_request_receipt_disputed: {
    en: (v) => ({
      title: 'Receipt problem reported',
      body: `${v.requesterLabel} — ${v.summary}. "${v.message}"`,
    }),
    ar: (v) => ({
      title: 'تم الإبلاغ عن مشكلة في الاستلام',
      body: `${v.requesterLabel} — ${v.summary}. «${v.message}»`,
    }),
    tr: (v) => ({
      title: 'Teslim sorunu bildirildi',
      body: `${v.requesterLabel} — ${v.summary}. "${v.message}"`,
    }),
    ku: (v) => ({
      title: 'کێشەی وەرگرتن ڕاگەیەنرا',
      body: `${v.requesterLabel} — ${v.summary}. «${v.message}»`,
    }),
  },
  material_request_issue_acknowledged: {
    en: () => ({
      title: 'Warehouse acknowledged your receipt report',
      body: 'A keeper has acknowledged your report. Please confirm when materials arrive, or contact the warehouse.',
    }),
    ar: () => ({
      title: 'المستودع أقرّ بتقريرك',
      body: 'أقرّ أحد أمناء المستودع بتقريرك. أكد الاستلام عند وصول المواد أو تواصل مع المستودع.',
    }),
    tr: () => ({
      title: 'Depo bildiriminizi onayladı',
      body: 'Bir depo sorumlusu bildiriminizi kaydetti. Malzemeler gelince onaylayın veya depoyla iletişime geçin.',
    }),
    ku: () => ({
      title: 'کۆگا ڕاپۆرتەکەت پشتڕاست کرد',
      body: 'پارێزەرێک ڕاپۆرتەکەت قبووڵ کرد. کاتێک کەرەستەکان گەیشتن پشتڕاستی بکەرەوە یان پەیوەندی بە کۆگاوە بکە.',
    }),
  },
  maintenance_crew_joined: {
    en: (v) => {
      const hasProx = Boolean(v.distanceM?.trim() && v.radiusM?.trim());
      if (hasProx) {
        return {
          title: 'Colleague joined your ticket crew',
          body: `${v.name} asked to join your ticket crew on ${v.ticketId} and was added after an on-site check: about ${v.distanceM}m from the job (workspace limit ${v.radiusM}m).`,
        };
      }
      return {
        title: 'Colleague joined your ticket crew',
        body: `${v.name} joined the ticket crew on ${v.ticketId}.`,
      };
    },
    ar: (v) => {
      const hasProx = Boolean(v.distanceM?.trim() && v.radiusM?.trim());
      if (hasProx) {
        return {
          title: 'انضم زميل إلى طاقم التذكرة',
          body: `${v.name} طلب الانضمام إلى طاقم التذكرة ${v.ticketId} وتمت إضافته بعد التحقق من الموقع: نحو ${v.distanceM}م من الموقع (حد المساحة ${v.radiusM}م).`,
        };
      }
      return {
        title: 'انضم زميل إلى طاقم التذكرة',
        body: `${v.name} انضم إلى طاقم التذكرة ${v.ticketId}.`,
      };
    },
    tr: (v) => {
      const hasProx = Boolean(v.distanceM?.trim() && v.radiusM?.trim());
      if (hasProx) {
        return {
          title: 'Meslektaş biletinizin ekibine katıldı',
          body: `${v.name}, ${v.ticketId} numaralı biletin ekip listesine katılmayı istedi; saha doğrulamasından sonra eklendi (işyerine yaklaşık ${v.distanceM} m, limit ${v.radiusM} m).`,
        };
      }
      return {
        title: 'Meslektaş biletinizin ekibine katıldı',
        body: `${v.name}, ${v.ticketId} numaralı biletin ekibine katıldı.`,
      };
    },
    ku: (v) => {
      const hasProx = Boolean(v.distanceM?.trim() && v.radiusM?.trim());
      if (hasProx) {
        return {
          title: 'هاوبەشێک بەشداری لیژنەی تیکەتەکەت بوو',
          body: `${v.name} داوای بەشداریکردن لە لیژنەی تیکەتی ${v.ticketId} کرد و دوای پشکنینی شوێن زیادکرا: نزیکەی ${v.distanceM}م لە شوێنی کار (سنووری ${v.radiusM}م).`,
        };
      }
      return {
        title: 'هاوبەشێک بەشداری لیژنەی تیکەتەکەت بوو',
        body: `${v.name} بەشداری لیژنەی تیکەتی ${v.ticketId} بوو.`,
      };
    },
  },
  maintenance_awaiting_your_confirm: {
    en: (v) => ({
      title: 'Confirm maintenance completion',
      body: `Your team finished work on ticket ${v.ticketId}. Please confirm or report an issue within about ${v.minutes} minutes (otherwise it will be accepted automatically).`,
    }),
    ar: (v) => ({
      title: 'تأكيد إكمال الصيانة',
      body: `أنهى الفريق العمل على التذكرة ${v.ticketId}. يُرجى التأكيد أو الإبلاغ عن مشكلة خلال نحو ${v.minutes} دقيقة (وإلا تُقبل تلقائياً).`,
    }),
    tr: (v) => ({
      title: 'Bakım tamamını onaylayın',
      body: `Ekip ${v.ticketId} talebinde işi bitirdi. Yaklaşık ${v.minutes} dakika içinde onaylayın veya sorun bildirin (aksi halde otomatik kabul edilir).`,
    }),
    ku: (v) => ({
      title: 'تەواوکردنی چاککردنەوە پشتڕاست بکەرەوە',
      body: `تیمەکە کارەکەی لە تیکەتی ${v.ticketId} تەواو کرد. تکایە لە نزیکەی ${v.minutes} خولەکدا پشتڕاستی بکەرەوە یان کێشە ڕابگەیەنە (وەگرنا بە شێوەی ئۆتۆماتیکی قبووڵ دەکرێت).`,
    }),
  },
  ticket_cancellation_requested: {
    en: (v) => ({
      title: 'Cancellation requested',
      body: `The requester asked to cancel this ticket: ${v.reason}`,
    }),
    ar: (v) => ({
      title: 'طلب إلغاء',
      body: `طلب مقدّم التذكرة الإلغاء: ${v.reason}`,
    }),
    tr: (v) => ({
      title: 'İptal talebi',
      body: `Talep sahibi iptal istedi: ${v.reason}`,
    }),
    ku: (v) => ({
      title: 'داواکاری هەڵوەشاندنەوە',
      body: `داواکار داوای هەڵوەشاندنەوەی کرد: ${v.reason}`,
    }),
  },
  ticket_cancellation_approved: {
    en: () => ({
      title: 'Ticket cancelled',
      body: 'Assigned staff approved your cancellation request.',
    }),
    ar: () => ({
      title: 'تم إلغاء التذكرة',
      body: 'وافق الموظف المعيّن على طلب الإلغاء.',
    }),
    tr: () => ({
      title: 'Talep iptal edildi',
      body: 'Atanan personel iptal talebinizi onayladı.',
    }),
    ku: () => ({
      title: 'تیکەت هەڵوەشێنرایەوە',
      body: 'کارمەندی دیاریکراو داواکاری هەڵوەشاندنەوەکەی پەسەند کرد.',
    }),
  },
  ticket_resubmit_to_requester: {
    en: (v) => ({
      title: 'Ticket needs your edits',
      body: `Field staff requested changes: ${v.reason}`,
    }),
    ar: (v) => ({
      title: 'التذكرة تحتاج تعديلاتك',
      body: `طلب الموظف تعديلات: ${v.reason}`,
    }),
    tr: (v) => ({
      title: 'Talep düzenlemenizi bekliyor',
      body: `Saha personeli değişiklik istedi: ${v.reason}`,
    }),
    ku: (v) => ({
      title: 'تیکەت پێویستی دەستکاری تۆیە',
      body: `کارمەند داوای گۆڕانکاری کرد: ${v.reason}`,
    }),
  },
  ticket_resubmit_to_staff: {
    en: (v) => ({
      title: 'Ticket returned to you',
      body: `Requester finished edits: ${v.reason}`,
    }),
    ar: (v) => ({
      title: 'أُعيدت التذكرة إليك',
      body: `أنهى مقدّم الطلب التعديلات: ${v.reason}`,
    }),
    tr: (v) => ({
      title: 'Talep size geri gönderildi',
      body: `Talep sahibi düzenlemeleri tamamladı: ${v.reason}`,
    }),
    ku: (v) => ({
      title: 'تیکەت گەڕێندرایەوە بۆ تۆ',
      body: `داواکار دەستکارییەکەی تەواو کرد: ${v.reason}`,
    }),
  },
  ticket_cancellation_rejected: {
    en: (v) => ({
      title: 'Cancellation declined',
      body: `Staff declined cancellation: ${v.reason}`,
    }),
    ar: (v) => ({
      title: 'رفض الإلغاء',
      body: `رفض الموظف الإلغاء: ${v.reason}`,
    }),
    tr: (v) => ({
      title: 'İptal reddedildi',
      body: `Personel iptali reddetti: ${v.reason}`,
    }),
    ku: (v) => ({
      title: 'هەڵوەشاندنەوە ڕەتکرایەوە',
      body: `کارمەند هەڵوەشاندنەوەکەی ڕەتکردەوە: ${v.reason}`,
    }),
  },
  maintenance_rejected_by_requester: {
    en: (v) => ({
      title: 'Requester reported an issue',
      body: `Ticket ${v.ticketId}: ${v.reason}`,
    }),
    ar: (v) => ({
      title: 'أبلغ مقدّم الطلب عن مشكلة',
      body: `التذكرة ${v.ticketId}: ${v.reason}`,
    }),
    tr: (v) => ({
      title: 'Talep sahibi sorun bildirdi',
      body: `Talep ${v.ticketId}: ${v.reason}`,
    }),
    ku: (v) => ({
      title: 'داواکار کێشەیەکی ڕاگەیاند',
      body: `تیکەت ${v.ticketId}: ${v.reason}`,
    }),
  },
  workspace_announcement: {
    en: (v) => ({
      title: v.title?.trim() || 'Workspace announcement',
      body: v.body?.trim() || 'Your workspace owner sent you a message.',
    }),
    ar: (v) => ({
      title: v.title?.trim() || 'إشعار من المالك',
      body: v.body?.trim() || 'أرسل مالك مساحة العمل رسالة لك.',
    }),
    tr: (v) => ({
      title: v.title?.trim() || 'Çalışma alanı duyurusu',
      body: v.body?.trim() || 'Çalışma alanı sahibi size bir mesaj gönderdi.',
    }),
    ku: (v) => ({
      title: v.title?.trim() || 'ڕاگەیەنراوی ئۆفیس',
      body: v.body?.trim() || 'خاوەنی شوێنی کار پەیامێکی بۆ ناردووی.',
    }),
  },
};

export function normalizeAppLocale(raw: string | null | undefined): AppNotificationLocale {
  if (!raw) return 'en';
  const lower = raw.trim().toLowerCase();
  if (lower === 'ckb' || lower.startsWith('ku')) return 'ku';
  if (lower === 'ar' || lower.startsWith('ar')) return 'ar';
  if (lower === 'tr' || lower.startsWith('tr')) return 'tr';
  return 'en';
}

export function formatNotificationCopy(locale: AppNotificationLocale, payload: NotificationCopyPayload): {
  title: string;
  body: string;
} {
  const loc = normalizeAppLocale(locale);
  const vars = payload.vars ?? {};
  const fn = TEMPLATES[payload.key][loc];
  return fn(vars);
}

export function stringifyNotificationPayload(payload: NotificationCopyPayload): object {
  return { key: payload.key, vars: payload.vars ?? {} };
}

export function parseNotificationPayload(raw: unknown): NotificationCopyPayload | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const key = o.key as string;
  const vars =
    typeof o.vars === 'object' && o.vars !== null && !Array.isArray(o.vars)
      ? Object.fromEntries(
          Object.entries(o.vars as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])
        )
      : {};
  if (!key || !NOTIFICATION_COPY_KEYS.has(key as NotificationCopyKey)) return null;
  return { key: key as NotificationCopyKey, vars };
}

export const NOTIFICATION_COPY_KEYS = new Set<NotificationCopyKey>(
  Object.keys(TEMPLATES) as NotificationCopyKey[]
);
