"""Generates the home-passport part of openapi.yaml from compact definitions.

Run once (python3 lib/api-spec/gen-home-spec.py); it rewrites the block between the
HOME-PASSPORT markers in openapi.yaml. Field shorthand:
  str / str(2,160) / str? (nullable) / int / int? / num? / bool / date? / dt / dt? / uuid / uuid?
  enum:a|b|c (enum?:a|b for nullable) / Ref / [Ref] / [str] / [uuid] / any
  trailing ~ on the field name = optional
"""
import re, yaml, pathlib

SPEC = pathlib.Path(__file__).with_name("openapi.yaml")

def field(t):
    nullable = False
    if t.startswith("enum"):
        nullable = t.startswith("enum?")
        vals = t.split(":", 1)[1].split("|")
        out = {"type": ["string", "null"] if nullable else "string", "enum": vals + ([None] if nullable else [])}
        return out
    if t.startswith("[") and t.endswith("]"):
        inner = t[1:-1]
        m = re.match(r"(\w+)(\((\d+)\))?", inner)
        base = m.group(1)
        out = {"type": "array", "items": field(base)}
        if m.group(3): out["maxItems"] = int(m.group(3))
        return out
    if t.endswith("?"):
        nullable = True; t = t[:-1]
    m = re.match(r"(\w+)(?:\((\d+),(\d+)\))?$", t)
    base, lo, hi = m.group(1), m.group(2), m.group(3)
    prim = {"str": ("string", None), "int": ("integer", None), "num": ("number", None), "bool": ("boolean", None),
            "date": ("string", "date"), "dt": ("string", "date-time"), "uuid": ("string", "uuid"), "any": (None, None)}
    if base in prim:
        typ, fmt = prim[base]
        if typ is None: return {}
        out = {"type": [typ, "null"] if nullable else typ}
        if fmt: out["format"] = fmt
        if lo is not None:
            if typ == "string": out["minLength"] = int(lo); out["maxLength"] = int(hi)
            else: out["minimum"] = int(lo); out["maximum"] = int(hi)
        return out
    ref = {"$ref": f"#/components/schemas/{base}"}
    return {"anyOf": [ref, {"type": "null"}]} if nullable else ref

def schema(fields):
    props, req = {}, []
    for k, t in fields.items():
        opt = k.endswith("~"); name = k.rstrip("~")
        props[name] = field(t)
        if not opt: req.append(name)
    out = {"type": "object", "properties": props}
    if req: out["required"] = req
    return out

S = {}
S["HomeMedia"] = {"id": "str", "url": "str", "contentType": "str", "originalName": "str", "caption": "str", "phase": "str", "workId": "str?", "roomId": "str?", "uploadedByMe": "bool", "createdAt": "dt"}
S["HomeMediaAttachInput"] = {"files": "[MediaInput(20)]", "homeId~": "uuid?", "workId~": "uuid?", "roomId~": "uuid?", "workerId~": "uuid?", "caption~": "str(0,300)", "phase~": "enum:before|during|after|hidden|other|document"}
S["HomePermissions"] = {"edit": "bool", "manageMembers": "bool", "manageSharing": "bool", "addWorks": "bool", "confirmWorks": "bool", "inspect": "bool", "viewAudit": "bool"}
S["Home"] = {"id": "str", "publicId": "str", "name": "str", "propertyType": "str", "city": "str", "district": "str", "address": "str", "areaM2": "int?", "roomCount": "int?", "floor": "str", "builtYear": "int?", "stage": "str", "coverMediaId": "str?", "coverUrl": "str?", "notes": "str", "publicLevel": "str", "publicShowAddress": "bool", "publicShowPhotos": "bool", "publicShowEquipment": "bool", "showOnWorkerProfiles": "bool", "myRole": "str", "permissions": "HomePermissions", "archived": "bool", "createdAt": "dt", "updatedAt": "dt"}
S["HomeInput"] = {"name": "str(2,160)", "propertyType": "enum:apartment|house|villa|office|commercial|other", "city~": "str(0,100)", "district~": "str(0,120)", "address~": "str(0,240)", "areaM2~": "int?", "roomCount~": "int?", "floor~": "str(0,20)", "builtYear~": "int?", "stage~": "enum:construction|renovation|living", "coverMediaId~": "uuid?", "notes~": "str(0,4000)"}
S["HomeSummary"] = {"id": "str", "publicId": "str", "name": "str", "propertyType": "str", "city": "str", "district": "str", "address": "str", "stage": "str", "coverUrl": "str?", "myRole": "str", "areaM2": "int?", "roomCount": "int?", "works": "int", "pendingApproval": "int", "performers": "int", "lastWorkAt": "str?", "updatedAt": "dt"}
S["HomeRoom"] = {"id": "str", "name": "str", "kind": "str", "floor": "str", "areaM2": "int?", "condition": "str", "notes": "str", "position": "int", "works": "int", "equipment": "int", "infrastructure": "int", "photoUrl": "str?"}
S["HomeRoomInput"] = {"name": "str(1,120)", "kind~": "enum:living|bedroom|kitchen|bathroom|toilet|hall|balcony|utility|other", "floor~": "str(0,20)", "areaM2~": "int?", "condition~": "enum:good|needs_repair|in_progress|unknown", "notes~": "str(0,2000)", "position~": "int"}
S["WorkerRef"] = {"id": "str", "kind": "str", "displayName": "str", "status": "str", "photoUrl": "str?", "specialties": "[str]", "registered": "bool", "identityVerified": "bool"}
S["Participant"] = {"id": "str", "worker": "WorkerRef", "role": "str", "status": "str", "viaTeamId": "str?", "viaTeamName": "str?", "note": "str", "invitedAt": "dt", "respondedAt": "dt?", "isMe": "bool", "phone": "str?", "canAddMedia": "bool", "canAddNotes": "bool", "canEdit": "bool"}
S["ParticipantBrief"] = {"workerId": "str", "name": "str", "kind": "str", "role": "str", "status": "str"}
S["WorkSummary"] = {"id": "str", "homeId": "str", "title": "str", "category": "str", "kind": "str", "status": "str", "startDate": "str?", "endDate": "str?", "roomId": "str?", "roomName": "str?", "participants": "[ParticipantBrief]", "mediaCount": "int", "openDefects": "int", "inspected": "bool", "visibility": "str", "materials": "str", "description": "str", "createdAt": "dt", "updatedAt": "dt"}
S["WorkNote"] = {"id": "str", "kind": "str", "body": "str", "result": "str?", "authorRole": "str", "authorIsMe": "bool", "createdAt": "dt"}
S["WorkNoteInput"] = {"kind": "enum:note|defect|fix|inspection", "body": "str(1,4000)", "result~": "enum?:passed|issues"}
S["WorkApproval"] = {"id": "str", "action": "str", "fromStatus": "str", "toStatus": "str", "actorRole": "str", "note": "str", "createdAt": "dt"}
S["Review"] = {"id": "str", "workId": "str", "workTitle": "str", "workerId": "str", "rating": "int", "body": "str", "createdAt": "dt", "reported": "bool", "mine": "bool"}
S["ReviewInput"] = {"workerId": "uuid", "rating": "int(1,5)", "body~": "str(0,2000)"}
S["ReportInput"] = {"reason": "str(3,300)"}
S["WorkPermissions"] = {"edit": "bool", "manageParticipants": "bool", "addMedia": "bool", "addNote": "bool", "start": "bool", "complete": "bool", "confirm": "bool", "requestRevision": "bool", "reopen": "bool", "inspect": "bool", "review": "bool"}
S["WorkDetail"] = {"id": "str", "homeId": "str", "homeName": "str", "title": "str", "category": "str", "kind": "str", "status": "str", "description": "str", "materials": "str", "location": "str", "startDate": "str?", "endDate": "str?", "roomId": "str?", "roomName": "str?", "equipmentId": "str?", "equipmentName": "str?", "visibility": "str", "cost": "num?", "currency": "str", "warrantyNote": "str", "addedByMe": "bool", "addedByRole": "str", "smetaProjectId": "str?", "smetaProjectName": "str?", "completedAt": "dt?", "confirmedAt": "dt?", "inspectedAt": "dt?", "participants": "[Participant]", "media": "[HomeMedia]", "notes": "[WorkNote]", "approvals": "[WorkApproval]", "reviews": "[Review]", "myRole": "str", "permissions": "WorkPermissions", "createdAt": "dt", "updatedAt": "dt"}
S["WorkInput"] = {"title": "str(2,200)", "category~": "enum:electrical|plumbing|waterproofing|plaster|painting|flooring|doors_windows|heating|hvac|sewer|tiling|drywall|welding|carpentry|roofing|insulation|general|other", "kind~": "enum:construction|renovation|installation|maintenance|repair|inspection", "roomId~": "uuid?", "equipmentId~": "uuid?", "description~": "str(0,6000)", "materials~": "str(0,3000)", "location~": "str(0,2000)", "startDate~": "date?", "endDate~": "date?", "visibility~": "enum:public|private", "status~": "enum:planned|in_progress|completed", "smetaProjectId~": "uuid?", "cost~": "num?", "currency~": "enum:AZN|USD|EUR", "warrantyNote~": "str(0,2000)"}
S["WorkStatusInput"] = {"action": "enum:start|complete|confirm|request_revision|reopen", "note~": "str(0,2000)"}
S["PlaceholderInput"] = {"name": "str(2,120)", "phone~": "str(0,32)", "specialty~": "str(0,60)", "kind~": "enum:individual|company"}
S["ParticipantInput"] = {"workerId~": "uuid?", "placeholder~": "PlaceholderInput", "role": "enum:lead|team_lead|team_member|assistant|supervisor|inspector", "viaTeamId~": "uuid?", "note~": "str(0,300)"}
S["ParticipantPatch"] = {"role~": "enum:lead|team_lead|team_member|assistant|supervisor|inspector", "status~": "enum:removed", "note~": "str(0,300)", "canAddMedia~": "bool", "canAddNotes~": "bool", "canEdit~": "bool"}
S["RespondInput"] = {"accept": "bool"}
S["HomePerformerWork"] = {"id": "str", "title": "str", "status": "str", "startDate": "str?", "role": "str"}
S["HomePerformer"] = {"worker": "WorkerRef", "roles": "[str]", "works": "[HomePerformerWork]", "phone": "str?"}
S["HomeMember"] = {"id": "str", "role": "str", "displayName": "str", "isMe": "bool", "createdAt": "dt"}
S["HomeOverviewStats"] = {"works": "int", "completed": "int", "confirmed": "int", "pendingApproval": "int", "equipment": "int", "infrastructure": "int", "performers": "int", "media": "int", "openDefects": "int"}
S["HomeOverview"] = {"home": "Home", "rooms": "[HomeRoom]", "stats": "HomeOverviewStats", "recentWorks": "[WorkSummary]", "performers": "[HomePerformer]"}
S["HomeRoomDetail"] = {"room": "HomeRoom", "works": "[WorkSummary]", "equipment": "[Equipment]", "infrastructure": "[InfrastructureItem]", "media": "[HomeMedia]"}
S["MarkerPoint"] = {"x": "num", "y": "num"}
S["InfrastructureItem"] = {"id": "str", "roomId": "str?", "roomName": "str?", "workId": "str?", "workTitle": "str?", "mediaId": "str?", "mediaUrl": "str?", "type": "str", "label": "str", "notes": "str", "points": "[MarkerPoint]", "source": "str", "createdByMe": "bool", "verified": "bool", "verifiedAt": "dt?", "createdAt": "dt"}
S["InfrastructureInput"] = {"roomId~": "uuid?", "workId~": "uuid?", "mediaId~": "uuid?", "type": "enum:electric|water|sewer|heating|gas|ventilation|internet|meter|valve|electrical_panel|other", "label~": "str(0,160)", "notes~": "str(0,2000)", "points~": "[MarkerPoint(200)]", "source~": "enum:owner|worker|plan|specialist"}
S["EquipmentService"] = {"id": "str", "title": "str", "status": "str", "startDate": "str?"}
S["Equipment"] = {"id": "str", "roomId": "str?", "roomName": "str?", "installWorkId": "str?", "installWorkTitle": "str?", "installers": "[WorkerRef]", "name": "str", "category": "str", "brand": "str", "model": "str", "serialNumber": "str", "installedAt": "str?", "warrantyUntil": "str?", "photoMediaId": "str?", "photoUrl": "str?", "notes": "str", "services": "[EquipmentService]", "lastServiceAt": "str?", "nextServiceAt": "str?", "serviceContact": "str"}
S["EquipmentInput"] = {"name": "str(1,160)", "category~": "enum:boiler|air_conditioner|water_filter|water_heater|electrical_panel|ventilation|appliance|other", "roomId~": "uuid?", "installWorkId~": "uuid?", "brand~": "str(0,80)", "model~": "str(0,120)", "serialNumber~": "str(0,120)", "installedAt~": "date?", "warrantyUntil~": "date?", "photoMediaId~": "uuid?", "notes~": "str(0,3000)", "nextServiceAt~": "date?", "serviceContact~": "str(0,300)"}
S["HomeInvitationInput"] = {"kind": "enum:work|member", "workId~": "uuid?", "role": "enum:lead|team_lead|team_member|assistant|supervisor|inspector|member|contributor|viewer", "name~": "str(0,120)", "contact~": "str(0,254)", "placeholderWorkerId~": "uuid?"}
S["TeamInvitationInput"] = {"role": "enum:member|representative", "name~": "str(0,120)", "contact~": "str(0,254)"}
S["InvitationLink"] = {"url": "str", "expiresAt": "dt"}
S["InvitationPreview"] = {"kind": "str", "role": "str", "status": "str", "expired": "bool", "homeName": "str?", "workTitle": "str?", "groupName": "str?", "groupKind": "str?", "name": "str", "placeholderName": "str?"}
S["WorkerProfileDraft"] = {"displayName": "str(2,160)", "specialties~": "[str(20)]", "city~": "str(0,100)", "phone~": "str(0,32)"}
S["HomeInvitationAcceptInput"] = {"workerId~": "uuid?", "createProfile~": "WorkerProfileDraft"}
S["InvitationAcceptResult"] = {"redirect": "str"}
S["InboxParticipation"] = {"participantId": "str", "workId": "str", "workTitle": "str", "homeId": "str", "homeName": "str", "role": "str", "worker": "WorkerRef", "invitedAt": "dt"}
S["InboxMembership"] = {"membershipId": "str", "group": "WorkerRef", "role": "str", "member": "WorkerRef", "createdAt": "dt"}
S["InboxApproval"] = {"work": "WorkSummary", "homeName": "str"}
S["Inbox"] = {"participations": "[InboxParticipation]", "memberships": "[InboxMembership]", "approvals": "[InboxApproval]"}
S["MyWork"] = {"work": "WorkSummary", "homeName": "str", "role": "str", "participantStatus": "str", "worker": "WorkerRef"}
S["WorkerHistoryItem"] = {"workId": "str", "title": "str", "category": "str", "kind": "str", "status": "str", "startDate": "str?", "endDate": "str?", "role": "str", "viaTeamName": "str?", "city": "str", "homeId": "str?", "homeName": "str?", "homePublicId": "str?"}
S["Membership"] = {"id": "str", "group": "WorkerRef", "member": "WorkerRef", "role": "str", "status": "str", "joinedAt": "dt?", "leftAt": "dt?", "createdAt": "dt"}
S["WorkerStats"] = {"works": "int", "confirmedWorks": "int", "homes": "int", "reviews": "int", "avgRating": "num?"}
S["Worker"] = {"id": "str", "kind": "str", "displayName": "str", "specialties": "[str]", "city": "str", "serviceArea": "str", "about": "str", "experienceYears": "int?", "photoMediaId": "str?", "photoUrl": "str?", "status": "str", "registered": "bool", "identityVerified": "bool", "phone": "str?", "email": "str?", "publicContact": "bool", "legalName": "str", "taxId": "str?", "createdAt": "dt", "canManage": "bool", "isMine": "bool", "members": "[Membership]", "groups": "[Membership]", "stats": "WorkerStats", "history": "[WorkerHistoryItem]", "reviews": "[Review]"}
S["WorkerCard"] = {"worker": "WorkerRef", "city": "str", "stats": "WorkerStats"}
S["WorkerInput"] = {"kind": "enum:individual|team|company", "displayName": "str(2,160)", "specialties~": "[str(20)]", "city~": "str(0,100)", "serviceArea~": "str(0,200)", "about~": "str(0,3000)", "experienceYears~": "int?", "photoMediaId~": "uuid?", "phone~": "str(0,32)", "email~": "str(0,254)", "publicContact~": "bool", "legalName~": "str(0,200)", "taxId~": "str(0,20)"}
S["WorkerPatch"] = {"displayName~": "str(2,160)", "specialties~": "[str(20)]", "city~": "str(0,100)", "serviceArea~": "str(0,200)", "about~": "str(0,3000)", "experienceYears~": "int?", "photoMediaId~": "uuid?", "phone~": "str(0,32)", "email~": "str(0,254)", "publicContact~": "bool", "legalName~": "str(0,200)", "taxId~": "str(0,20)"}
S["MyWorkers"] = {"individual": "Worker?", "managed": "[WorkerCard]", "memberships": "[Membership]"}
S["MembershipInput"] = {"memberWorkerId": "uuid", "role~": "enum:member|representative"}
S["MembershipPatch"] = {"status~": "enum:left|removed", "role~": "enum:leader|member|representative"}
S["ShareScope"] = {"roomIds": "[str]", "workIds": "[str]", "equipmentIds": "[str]", "includePhotos": "bool", "includeInfrastructure": "bool", "includeAddress~": "bool", "documentIds~": "[str]", "purpose~": "enum:general|sale|handover"}
S["HomeShare"] = {"id": "str", "label": "str", "level": "str", "scope": "ShareScope", "expiresAt": "dt?", "revokedAt": "dt?", "active": "bool", "openCount": "int", "lastOpenedAt": "dt?", "createdAt": "dt"}
S["HomeShareInput"] = {"label~": "str(0,120)", "level": "enum:selected|technical", "scope": "ShareScope", "expiresInDays~": "int?"}
S["HomeShareCreated"] = {"share": "HomeShare", "url": "str"}
S["HomeSharing"] = {"publicLevel": "str", "publicShowAddress": "bool", "publicShowPhotos": "bool", "publicShowEquipment": "bool", "showOnWorkerProfiles": "bool", "publicUrl": "str", "shares": "[HomeShare]"}
S["HomeSharingInput"] = {"publicLevel": "enum:off|basic|history", "publicShowAddress": "bool", "publicShowPhotos": "bool", "publicShowEquipment": "bool", "showOnWorkerProfiles": "bool"}
S["AuditEntry"] = {"id": "str", "action": "str", "entityType": "str", "entityId": "str?", "summary": "str", "actorRole": "str", "actorIsMe": "bool", "changes": "any", "createdAt": "dt"}
S["PublicPerformer"] = {"id": "str", "displayName": "str", "kind": "str", "role": "str", "profilePublic": "bool"}
S["PublicWork"] = {"id": "str", "title": "str", "category": "str", "kind": "str", "status": "str", "startDate": "str?", "endDate": "str?", "roomName": "str?", "performers": "[PublicPerformer]", "photos": "[str]", "confirmed": "bool", "inspected": "bool", "description": "str", "materials": "str", "source": "str", "hasDocuments": "bool", "notes": "[PublicWorkNote]", "updatedAt": "dt"}
S["PublicWorkNote"] = {"kind": "str", "body": "str", "result": "str?", "authorRole": "str", "createdAt": "dt"}
S["PublicDocument"] = {"id": "str", "title": "str", "url": "str", "contentType": "str", "createdAt": "dt"}
S["PublicEquipment"] = {"id": "str", "name": "str", "category": "str", "brand": "str", "model": "str", "installedAt": "str?", "warrantyUntil": "str?", "roomName": "str?", "lastServiceAt": "str?", "nextServiceAt": "str?"}
S["PublicInfrastructure"] = {"id": "str", "type": "str", "label": "str", "notes": "str", "roomName": "str?", "mediaUrl": "str?", "points": "[MarkerPoint]", "source": "str", "verified": "bool", "createdAt": "dt"}
S["PublicHome"] = {"publicId": "str", "name": "str", "propertyType": "str", "city": "str", "district": "str", "address": "str?", "areaM2": "int?", "roomCount": "int?", "builtYear": "int?", "stage": "str", "coverUrl": "str?", "level": "str", "rooms": "[str]", "works": "[PublicWork]", "equipment": "[PublicEquipment]", "infrastructure": "[PublicInfrastructure]", "documents": "[PublicDocument]", "purpose": "str", "shareLabel": "str?", "updatedAt": "dt", "lastChangeAt": "dt?"}
S["IdentityInput"] = {"verified": "bool"}
S["HideInput"] = {"hidden": "bool"}
S["HomeSmeta"] = {"id": "str", "name": "str", "district": "str", "areaM2": "num?", "status": "str", "mine": "bool", "updatedAt": "dt", "estimatedTotal": "num?", "spentTotal": "num?"}
S["PassportSection"] = {"key": "str", "label": "str", "count": "int", "filled": "bool", "hint": "str", "path": "str"}
S["PassportAttention"] = {"kind": "str", "text": "str", "path": "str", "date": "str?"}
S["HomePassport"] = {"percent": "int", "filledSections": "int", "totalSections": "int", "sections": "[PassportSection]", "sources": "PassportSources", "lastChangeAt": "dt?", "lastChangeByRole": "str?", "lastChangeByMe": "bool", "lastChangeSummary": "str?", "attention": "[PassportAttention]"}
S["PassportSources"] = {"owner": "int", "contractor": "int", "documented": "int", "specialist": "int"}
S["CostLine"] = {"key": "str", "currency": "str", "total": "num", "count": "int"}
S["HomeCosts"] = {"byCurrency": "[CostLine]", "byCategory": "[CostLine]", "worksWithCost": "int", "worksWithoutCost": "int", "estimates": "[HomeSmeta]"}
S["Reminder"] = {"kind": "str", "homeId": "str", "homeName": "str", "equipmentId": "str", "title": "str", "dueDate": "str", "overdue": "bool"}
S["ServiceInterestInput"] = {"kind": "enum:inspection|pro_account|maintenance|handover", "homeId~": "uuid?", "contact~": "str(0,200)", "note~": "str(0,1000)"}
S["HomeSmetaLinkInput"] = {"smetaProjectId": "uuid", "linked": "bool"}
S["ReadLinkInput"] = {"url": "str(5,2000)"}
S["ReadTextInput"] = {"text": "str(10,20000)"}
S["ListingFields"] = {"dealType": "str?", "city": "str?", "district": "str?", "areaM2": "num?", "rooms": "int?", "floor": "int?", "floorsTotal": "int?", "buildingType": "str", "renovation": "str", "furnished": "str", "price": "num?", "currency": "str?", "title": "str?", "description": "str?"}
S["ListingDraft"] = {"snapshotId": "str?", "source": "str", "url": "str?", "portal": "str?", "fields": "ListingFields", "found": "[str]", "warnings": "[str]"}
S["ListingInput"] = {"snapshotId~": "uuid?", "url~": "str?", "source": "enum:link|text|manual", "dealType~": "enum:sale|rent", "city": "str(0,100)", "district~": "str(0,120)", "areaM2": "num", "rooms~": "int?", "floor~": "int?", "floorsTotal~": "int?", "buildingType~": "enum:new|old|house|unknown", "renovation~": "enum:yes|no|unknown", "furnished~": "enum:yes|no|unknown", "price~": "num?", "currency~": "enum:AZN|USD", "title~": "str(0,300)", "description~": "str(0,4000)"}
S["ValuationInput"] = {"subject": "ListingInput", "comparables~": "[ListingInput(20)]", "usdRate~": "num?", "usePool~": "bool"}
S["Listing"] = {"id": "str", "url": "str?", "portal": "str?", "source": "str", "city": "str", "district": "str", "areaM2": "num?", "rooms": "int?", "floor": "int?", "floorsTotal": "int?", "buildingType": "str", "renovation": "str", "furnished": "str", "price": "num?", "currency": "str?", "priceAzn": "num?", "title": "str", "fetchedAt": "dt"}
S["ValuationComp"] = {"listing": "Listing", "score": "num", "pricePerM2": "num?", "used": "bool", "userAdded": "bool", "notes": "[str]"}
S["ValuationEstimate"] = {"low": "num", "central": "num", "high": "num", "perM2Low": "num", "perM2": "num", "perM2High": "num"}
S["ValuationFactor"] = {"effect": "str", "text": "str"}
S["Valuation"] = {"id": "str", "createdAt": "dt", "status": "str", "confidence": "str", "confidenceReasons": "[str]", "subject": "Listing", "estimate": "ValuationEstimate?", "comparables": "[ValuationComp]", "factors": "[ValuationFactor]", "missing": "[str]", "assumptions": "[str]", "askingNote": "str?", "usdRate": "num", "poolSize": "int"}
S["ValuationSummary"] = {"id": "str", "createdAt": "dt", "title": "str", "city": "str", "district": "str", "areaM2": "num?", "central": "num?", "confidence": "str", "status": "str"}
S["ConstructionEstimateInput"] = {"name": "str(1,200)", "data": "any"}
S["ConstructionEstimate"] = {"id": "str", "name": "str", "data": "any", "createdAt": "dt", "updatedAt": "dt"}
S["ConstructionEstimateSummary"] = {"id": "str", "name": "str", "updatedAt": "dt", "total": "num?", "unpriced": "int?"}
S["PriceBase"] = {"items": "any", "generatedAt": "dt", "staleDays": "int", "admin": "bool"}
S["PriceQuoteInput"] = {"itemCode": "str(1,80)", "tier": "enum:ekonom|standart|premium|any", "price": "num", "sourceKind": "enum:supplier|contractor|published", "sourceName": "str(2,200)", "sourceUrl~": "str?", "observedAt": "date", "note~": "str(0,500)"}
S["PriceImportInput"] = {"csv": "str(1,300000)"}
S["PriceImportResult"] = {"added": "int", "errors": "[str]"}
S["RepairEstimateInput"] = {"name": "str(1,200)", "data": "any"}
S["RepairEstimate"] = {"id": "str", "name": "str", "data": "any", "createdAt": "dt", "updatedAt": "dt"}
S["RepairEstimateSummary"] = {"id": "str", "name": "str", "updatedAt": "dt", "totalLow": "num?", "total": "num?", "totalHigh": "num?", "area": "num?"}
S["ProtocolCreateInput"] = {"role": "enum:realtor|seller|buyer", "propertyType": "enum:apartment|house|other", "address": "str(3,300)", "handoverDate~": "date?", "sellerName~": "str(0,160)", "sellerPhone~": "str(0,40)", "buyerName~": "str(0,160)", "buyerPhone~": "str(0,40)", "realtorName~": "str(0,160)", "realtorPhone~": "str(0,40)"}
S["ProtocolPatch"] = {"propertyType~": "enum:apartment|house|other", "address~": "str(3,300)", "handoverDate~": "date?", "sellerName~": "str(0,160)", "sellerPhone~": "str(0,40)", "buyerName~": "str(0,160)", "buyerPhone~": "str(0,40)", "realtorName~": "str(0,160)", "realtorPhone~": "str(0,40)", "extras~": "any"}
S["ProtocolRoomInput"] = {"name~": "str(1,120)", "kind~": "enum:living|bed|kitchen|bath|hall|balcony|other", "condition~": "enum?:good|fair|defective", "note~": "str(0,4000)"}
S["ProtocolDefectInput"] = {"roomId~": "uuid?", "text": "str(1,2000)"}
S["ProtocolMediaInput"] = {"files": "[MediaInput(10)]", "roomId~": "uuid?", "defectId~": "uuid?", "itemId~": "uuid?", "target": "enum:room|item|defect|meter|keys|other", "meterKind~": "enum?:water|gas|electric", "caption~": "str(0,300)", "takenAt~": "dt?", "takenSource~": "enum?:camera|exif"}
S["ProtocolItemInput"] = {"roomId~": "uuid?", "name~": "str(1,120)", "category~": "enum:wall|floor|ceiling|window|door|furniture|appliance|other", "quantity~": "int", "condition~": "enum?:good|fair|defective", "note~": "str(0,2000)", "change~": "enum?:unchanged|new_damage|changed|resolved|missing"}
S["RentalCreateInput"] = {"role": "enum:landlord|tenant|realtor", "propertyType~": "enum:apartment|house|other", "address": "str(3,300)", "landlordName~": "str(0,160)", "landlordPhone~": "str(0,40)", "tenantName~": "str(0,160)", "tenantPhone~": "str(0,40)", "realtorName~": "str(0,160)", "realtorPhone~": "str(0,40)", "startDate~": "date?", "endDate~": "date?", "monthlyRent~": "int?", "deposit~": "int?", "currency~": "enum:AZN|USD|EUR"}
S["RentalPatch"] = {"propertyType~": "enum:apartment|house|other", "address~": "str(3,300)", "landlordName~": "str(0,160)", "landlordPhone~": "str(0,40)", "tenantName~": "str(0,160)", "tenantPhone~": "str(0,40)", "realtorName~": "str(0,160)", "realtorPhone~": "str(0,40)", "startDate~": "date?", "endDate~": "date?", "monthlyRent~": "int?", "deposit~": "int?", "currency~": "enum:AZN|USD|EUR", "notes~": "str(0,4000)"}
S["RentalDetail"] = {"rental": "any", "participants": "any", "invites": "any", "protocols": "any", "me": "any"}
S["RentalSummary"] = {"id": "str", "number": "str", "address": "str", "myRole": "str", "startDate": "str?", "endDate": "str?", "moveIn": "str?", "moveOut": "str?", "updatedAt": "dt"}
S["RentalInviteInput"] = {"role": "enum:landlord|tenant|realtor", "canEdit~": "bool"}
S["RentalInvitePreview"] = {"role": "str", "canEdit": "bool", "used": "bool", "usedByMe": "bool", "rentalId": "str", "detail": "any"}
S["AdminRentalStats"] = {"stats": "any"}
S["ProtocolInviteInput"] = {"role": "enum:realtor|seller|buyer"}
S["ProtocolInviteLink"] = {"id": "str", "role": "str", "url": "str"}
S["ProtocolDecisionInput"] = {"version": "int", "contentHash": "str(64,64)", "decision": "enum:approved|changes", "comment~": "str(0,2000)"}
S["ProtocolDetail"] = {"protocol": "any", "rooms": "any", "defects": "any", "media": "any", "participants": "any", "invites": "any", "versions": "any", "approvals": "any", "events": "any", "me": "any"}
S["ProtocolSummary"] = {"id": "str", "number": "str", "address": "str", "status": "str", "myRole": "str", "handoverDate": "str?", "updatedAt": "dt", "rooms": "int", "photos": "int"}
S["ProtocolInvitePreview"] = {"role": "str", "used": "bool", "usedByMe": "bool", "protocolId": "str", "detail": "any"}
S["HomeWorkItem"] = {"work": "WorkSummary", "homeName": "str", "myRole": "str"}
S["MeRoles"] = {"staff": "bool", "hasHomes": "bool", "managesHomes": "bool", "isPerformer": "bool", "hasProjects": "bool"}

def ok(desc, ref, status="200", array=False):
    sch = {"type": "array", "items": {"$ref": f"#/components/schemas/{ref}"}} if array else {"$ref": f"#/components/schemas/{ref}"}
    return {status: {"description": desc, "content": {"application/json": {"schema": sch}}}}

def body(ref):
    return {"required": True, "content": {"application/json": {"schema": {"$ref": f"#/components/schemas/{ref}"}}}}

P = lambda *names: [{"$ref": f"#/components/parameters/{n}"} for n in names]
paths = {}
def op(path, method, opid, summary, params=(), req=None, resp=None):
    o = {"operationId": opid, "tags": ["home"], "summary": summary}
    if params: o["parameters"] = P(*params)
    if req: o["requestBody"] = body(req)
    o["responses"] = resp
    paths.setdefault(path, {})[method] = o

AR = ok("Done", "ActionResult")
op("/homes", "get", "listHomes", "Homes the signed-in user owns or is a member of", resp=ok("Homes", "HomeSummary", array=True))
op("/homes", "post", "createHome", "Create a home; the creator becomes its owner", req="HomeInput", resp=ok("Created", "HomeOverview", "201"))
op("/homes/{homeId}", "get", "getHomeOverview", "Home profile with rooms, counters, recent works and performers", ("HomeId",), resp=ok("Home", "HomeOverview"))
op("/homes/{homeId}", "patch", "updateHome", "Edit home profile (owner)", ("HomeId",), "HomeInput", ok("Saved", "HomeOverview"))
op("/homes/{homeId}", "delete", "archiveHome", "Archive (never delete) a home (owner)", ("HomeId",), resp=AR)
op("/homes/{homeId}/rooms", "post", "createHomeRoom", "Add a room", ("HomeId",), "HomeRoomInput", ok("Created", "HomeRoom", "201"))
op("/homes/{homeId}/rooms/{roomId}", "get", "getHomeRoom", "Room with its works, equipment, utility lines and media", ("HomeId", "RoomId"), resp=ok("HomeRoom", "HomeRoomDetail"))
op("/homes/{homeId}/rooms/{roomId}", "patch", "updateHomeRoom", "Edit room", ("HomeId", "RoomId"), "HomeRoomInput", ok("Saved", "HomeRoom"))
op("/homes/{homeId}/rooms/{roomId}", "delete", "deleteHomeRoom", "Delete room; linked records keep existing without a room", ("HomeId", "RoomId"), resp=AR)
op("/homes/{homeId}/members", "get", "listHomeMembers", "Account members (owner, technician, viewer)", ("HomeId",), resp=ok("Members", "HomeMember", array=True))
op("/homes/{homeId}/members/{memberId}", "delete", "removeHomeMember", "Remove a technician or viewer (owner)", ("HomeId", "MemberId"), resp=AR)
op("/homes/{homeId}/performers", "get", "listHomePerformers", "Individuals, teams and companies that worked in this home", ("HomeId",), resp=ok("Performers", "HomePerformer", array=True))
op("/homes/{homeId}/works", "get", "listWorks", "Construction and repair history, newest first", ("HomeId",), resp=ok("Works", "WorkSummary", array=True))
op("/homes/{homeId}/works", "post", "createWork", "Create a work record", ("HomeId",), "WorkInput", ok("Created", "WorkDetail", "201"))
op("/homes/{homeId}/media", "get", "listHomeMedia", "Photos and videos of the home visible to the caller", ("HomeId",), resp=ok("Media", "HomeMedia", array=True))
op("/homes/{homeId}/infrastructure", "get", "listInfrastructure", "Hidden utility lines marked on photos", ("HomeId",), resp=ok("Items", "InfrastructureItem", array=True))
op("/homes/{homeId}/infrastructure", "post", "createInfrastructure", "Mark a utility line", ("HomeId",), "InfrastructureInput", ok("Created", "InfrastructureItem", "201"))
op("/infrastructure/{itemId}", "patch", "updateInfrastructure", "Edit a utility line (author or owner)", ("ItemId",), "InfrastructureInput", ok("Saved", "InfrastructureItem"))
op("/infrastructure/{itemId}", "delete", "deleteInfrastructure", "Delete a utility line (author or owner)", ("ItemId",), resp=AR)
op("/infrastructure/{itemId}/verify", "post", "verifyInfrastructure", "Technician confirms the marking", ("ItemId",), resp=ok("Verified", "InfrastructureItem"))
op("/homes/{homeId}/equipment", "get", "listEquipment", "Equipment register", ("HomeId",), resp=ok("Equipment", "Equipment", array=True))
op("/homes/{homeId}/equipment", "post", "createEquipment", "Add equipment", ("HomeId",), "EquipmentInput", ok("Created", "Equipment", "201"))
op("/equipment/{equipmentId}", "patch", "updateEquipment", "Edit equipment", ("EquipmentId",), "EquipmentInput", ok("Saved", "Equipment"))
op("/equipment/{equipmentId}", "delete", "deleteEquipment", "Delete equipment (owner)", ("EquipmentId",), resp=AR)
op("/homes/{homeId}/invitations", "post", "createHomeInvitation", "Invitation link for a performer (to a work) or a technician / viewer (to the home)", ("HomeId",), "HomeInvitationInput", ok("Link", "InvitationLink"))
op("/homes/{homeId}/sharing", "get", "getHomeSharing", "QR page settings and secret share links", ("HomeId",), resp=ok("Sharing", "HomeSharing"))
op("/homes/{homeId}/sharing", "put", "updateHomeSharing", "Change what the QR page shows", ("HomeId",), "HomeSharingInput", ok("Sharing", "HomeSharing"))
op("/homes/{homeId}/shares", "post", "createHomeShare", "Create a revocable secret share link", ("HomeId",), "HomeShareInput", ok("Created", "HomeShareCreated"))
op("/homes/{homeId}/shares/{shareId}", "delete", "revokeHomeShare", "Revoke a share link", ("HomeId", "ShareId"), resp=AR)
op("/homes/{homeId}/smetas", "get", "listHomeSmetas", "AI Smeta estimates saved in this home (planned work, not history)", ("HomeId",), resp=ok("Smetas", "HomeSmeta", array=True))
op("/homes/{homeId}/smetas", "post", "linkHomeSmeta", "Save one of my estimates in this home, or remove it", ("HomeId",), "HomeSmetaLinkInput", ok("Smetas", "HomeSmeta", array=True))
op("/homes/{homeId}/audit", "get", "listHomeAudit", "Audit trail (owner and technician)", ("HomeId",), resp=ok("Entries", "AuditEntry", array=True))
op("/works/{workId}", "get", "getWork", "Work with participants, media, notes, status history", ("WorkId",), resp=ok("Work", "WorkDetail"))
op("/works/{workId}", "patch", "updateWork", "Edit a work; changes are audited", ("WorkId",), "WorkInput", ok("Saved", "WorkDetail"))
op("/works/{workId}/status", "post", "changeWorkStatus", "Start, complete, confirm, request revision or reopen", ("WorkId",), "WorkStatusInput", ok("Saved", "WorkDetail"))
op("/works/{workId}/notes", "post", "addWorkNote", "Add a note, defect, fix or inspection result", ("WorkId",), "WorkNoteInput", ok("Saved", "WorkDetail"))
op("/works/{workId}/participants", "post", "addWorkParticipant", "Invite a registered performer, record a non-registered one, or add a team member", ("WorkId",), "ParticipantInput", ok("Saved", "WorkDetail"))
op("/works/{workId}/participants/{participantId}", "patch", "updateWorkParticipant", "Change role or remove a participant", ("WorkId", "ParticipantId"), "ParticipantPatch", ok("Saved", "WorkDetail"))
op("/works/{workId}/reviews", "post", "createReview", "Review a performer of a confirmed work (home owner, once)", ("WorkId",), "ReviewInput", ok("Saved", "WorkDetail"))
op("/reviews/{reviewId}/report", "post", "reportReview", "Report a review as wrong or disputed", ("ReviewId",), "ReportInput", resp=AR)
op("/participations/{participantId}/respond", "post", "respondParticipation", "Accept or decline an invitation to a work", ("ParticipantId",), "RespondInput", resp=AR)
op("/memberships/{membershipId}/respond", "post", "respondMembership", "Accept or decline a team / company invitation", ("MembershipId",), "RespondInput", resp=AR)
op("/me/inbox", "get", "getMyInbox", "Pending invitations and works waiting for my confirmation", resp=ok("Inbox", "Inbox"))
op("/me/home-works", "get", "listMyHomeWorks", "Repair history across all homes I own or manage", resp=ok("Works", "HomeWorkItem", array=True))
op("/homes/{homeId}/passport", "get", "getHomePassport", "Passport completeness: which sections have data (not a quality score)", ("HomeId",), resp=ok("Passport", "HomePassport"))
op("/homes/{homeId}/costs", "get", "getHomeCosts", "Actual costs entered on works plus estimates saved in the home (members)", ("HomeId",), resp=ok("Costs", "HomeCosts"))
op("/me/reminders", "get", "listMyReminders", "Upcoming service dates and warranty ends across my homes (shown in the app only)", resp=ok("Reminders", "Reminder", array=True))
op("/service-interests", "post", "createServiceInterest", "Register interest in a service that is not available yet", req="ServiceInterestInput", resp=AR)
op("/valuation/read-link", "post", "readListingLink", "Read one listing page the user linked (allow-listed portals, robots.txt respected)", req="ReadLinkInput", resp=ok("Draft", "ListingDraft"))
op("/valuation/read-text", "post", "readListingText", "Read listing facts from pasted text", req="ReadTextInput", resp=ok("Draft", "ListingDraft"))
op("/valuations", "get", "listValuations", "My market-value calculations", resp=ok("Valuations", "ValuationSummary", array=True))
op("/valuations", "post", "createValuation", "Compare a listing with real comparable listings (asking prices)", req="ValuationInput", resp=ok("Valuation", "Valuation", "201"))
op("/valuations/{valuationId}", "get", "getValuation", "One saved calculation with its sources", ("ValuationId",), resp=ok("Valuation", "Valuation"))
op("/construction-estimates", "get", "listConstructionEstimates", "My construction estimates", resp=ok("Estimates", "ConstructionEstimateSummary", array=True))
op("/construction-estimates", "post", "createConstructionEstimate", "Save a new construction estimate", req="ConstructionEstimateInput", resp=ok("Saved", "ConstructionEstimate", "201"))
op("/construction-estimates/{estimateId}", "get", "getConstructionEstimate", "One construction estimate (owner only)", ("EstimateId",), resp=ok("Estimate", "ConstructionEstimate"))
op("/construction-estimates/{estimateId}", "put", "updateConstructionEstimate", "Save changes", ("EstimateId",), "ConstructionEstimateInput", ok("Saved", "ConstructionEstimate"))
op("/construction-estimates/{estimateId}", "delete", "deleteConstructionEstimate", "Delete (owner only)", ("EstimateId",), resp=AR)
op("/prices", "get", "getPriceBase", "Unit prices for repair estimates: low / median / high per tier with sources and dates (no sign-in)", resp=ok("Prices", "PriceBase"))
op("/prices/quotes", "post", "addPriceQuote", "Price administrator adds one observed price with its source", req="PriceQuoteInput", resp=ok("Saved", "ActionResult", "201"))
op("/prices/quotes/{quoteId}", "delete", "removePriceQuote", "Price administrator withdraws a price (kept for history)", ("QuoteId",), resp=AR)
op("/prices/import", "post", "importPrices", "Price administrator imports prices from CSV", req="PriceImportInput", resp=ok("Imported", "PriceImportResult"))
op("/repair-estimates", "get", "listRepairEstimates", "My repair estimates", resp=ok("Estimates", "RepairEstimateSummary", array=True))
op("/repair-estimates", "post", "createRepairEstimate", "Save a repair estimate", req="RepairEstimateInput", resp=ok("Saved", "RepairEstimate", "201"))
op("/repair-estimates/{estimateId}", "get", "getRepairEstimate", "One repair estimate (owner only)", ("EstimateId",), resp=ok("Estimate", "RepairEstimate"))
op("/repair-estimates/{estimateId}", "put", "updateRepairEstimate", "Save changes", ("EstimateId",), "RepairEstimateInput", ok("Saved", "RepairEstimate"))
op("/repair-estimates/{estimateId}", "delete", "deleteRepairEstimate", "Delete (owner only)", ("EstimateId",), resp=AR)
op("/protocols", "get", "listProtocols", "Handover protocols I take part in", resp=ok("Protocols", "ProtocolSummary", array=True))
op("/protocols", "post", "createProtocol", "Create a handover protocol (the creator manages it)", req="ProtocolCreateInput", resp=ok("Created", "ProtocolDetail", "201"))
op("/protocols/{protocolId}", "get", "getProtocol", "Protocol with rooms, photos, parties, versions and approvals (participants)", ("ProtocolId",), resp=ok("Protocol", "ProtocolDetail"))
op("/protocols/{protocolId}", "patch", "updateProtocol", "Edit details, meters, keys, notes (only while collecting)", ("ProtocolId",), "ProtocolPatch", ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}", "delete", "archiveProtocol", "Archive (creator; not after approval)", ("ProtocolId",), resp=AR)
op("/protocols/{protocolId}/rooms", "post", "addProtocolRoom", "Add a room", ("ProtocolId",), "ProtocolRoomInput", ok("Saved", "ProtocolDetail", "201"))
op("/protocols/{protocolId}/rooms/{roomId}", "patch", "updateProtocolRoom", "Edit a room: condition, note, name", ("ProtocolId", "RoomId"), "ProtocolRoomInput", ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/rooms/{roomId}", "delete", "deleteProtocolRoom", "Remove a room", ("ProtocolId", "RoomId"), resp=ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/defects", "post", "addProtocolDefect", "Record a defect", ("ProtocolId",), "ProtocolDefectInput", ok("Saved", "ProtocolDetail", "201"))
op("/protocols/{protocolId}/defects/{defectId}", "delete", "deleteProtocolDefect", "Remove a defect", ("ProtocolId", "DefectId"), resp=ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/media", "post", "addProtocolMedia", "Attach uploaded photos to a room, defect, meter or keys", ("ProtocolId",), "ProtocolMediaInput", ok("Saved", "ProtocolDetail", "201"))
op("/protocols/{protocolId}/media/{mediaId}", "delete", "deleteProtocolMedia", "Remove a photo", ("ProtocolId", "MediaId"), resp=ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/invites", "post", "createProtocolInvite", "Invitation link for a party (creator); replaces the previous link for that role", ("ProtocolId",), "ProtocolInviteInput", ok("Link", "ProtocolInviteLink", "201"))
op("/protocols/{protocolId}/invites/{inviteId}", "delete", "revokeProtocolInvite", "Revoke an invitation link (creator)", ("ProtocolId", "InviteId"), resp=AR)
op("/protocols/{protocolId}/submit", "post", "submitProtocol", "Freeze the content as a new version and ask the parties to approve (creator)", ("ProtocolId",), resp=ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/reopen", "post", "reopenProtocol", "Allow edits again; the next submission becomes a new version (creator)", ("ProtocolId",), resp=ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/decisions", "post", "decideProtocol", "Seller or buyer approves the version or asks for changes", ("ProtocolId",), "ProtocolDecisionInput", ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/versions/{version}/pdf", "post", "createProtocolPdf", "Generate the PDF of a version", ("ProtocolId", "VersionNo"), resp=ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/versions/{version}/pdf", "get", "getProtocolPdf", "Download the PDF of a version (participants)", ("ProtocolId", "VersionNo"), resp={"200": {"description": "PDF", "content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}}}})
op("/protocol-media/{mediaId}", "get", "getProtocolMedia", "Photo of a protocol (participants or a valid invitation link)", ("MediaId",), resp={"200": {"description": "File", "content": {"*/*": {"schema": {"type": "string", "format": "binary"}}}}})
op("/protocol-invites/{token}", "get", "getProtocolInvite", "What an invitation link shows (no sign-in)", ("InviteToken",), resp=ok("Invitation", "ProtocolInvitePreview"))
op("/protocol-invites/{token}/accept", "post", "acceptProtocolInvite", "Join the protocol in the invited role (signed in)", ("InviteToken",), resp=ok("Protocol", "ProtocolDetail"))
op("/rentals", "get", "listRentals", "Rentals I take part in (landlord, manager, tenant, realtor)", resp=ok("Rentals", "RentalSummary", array=True))
op("/rentals", "post", "createRental", "Create a rental with its move-in protocol", req="RentalCreateInput", resp=ok("Created", "RentalDetail", "201"))
op("/rentals/{rentalId}", "get", "getRental", "Rental with parties, invitations and its protocols", ("RentalId",), resp=ok("Rental", "RentalDetail"))
op("/rentals/{rentalId}", "patch", "updateRental", "Edit rental details", ("RentalId",), "RentalPatch", ok("Saved", "RentalDetail"))
op("/rentals/{rentalId}", "delete", "archiveRental", "Archive (creator); approved protocols stay as records", ("RentalId",), resp=AR)
op("/rentals/{rentalId}/invites", "post", "createRentalInvite", "Invitation link for the other party, with or without editing rights", ("RentalId",), "RentalInviteInput", ok("Link", "ProtocolInviteLink", "201"))
op("/rentals/{rentalId}/invites/{inviteId}", "delete", "revokeRentalInvite", "Revoke an invitation link", ("RentalId", "InviteId"), resp=AR)
op("/rentals/{rentalId}/move-out", "post", "createMoveOut", "Start the move-out protocol from the move-in one (rooms, items, photos for comparison)", ("RentalId",), resp=ok("Rental", "RentalDetail"))
op("/rental-invites/{token}", "get", "getRentalInvite", "What a rental invitation shows (no sign-in)", ("InviteToken",), resp=ok("Invitation", "RentalInvitePreview"))
op("/rental-invites/{token}/accept", "post", "acceptRentalInvite", "Join the rental in the invited role (signed in)", ("InviteToken",), resp=ok("Rental", "RentalDetail"))
op("/protocols/{protocolId}/items", "post", "addProtocolItem", "Add an item to a room (furniture, appliance…)", ("ProtocolId",), "ProtocolItemInput", ok("Saved", "ProtocolDetail", "201"))
op("/protocols/{protocolId}/items/{itemId}", "patch", "updateProtocolItem", "Condition, note, quantity or move-out change of an item", ("ProtocolId", "ItemId"), "ProtocolItemInput", ok("Saved", "ProtocolDetail"))
op("/protocols/{protocolId}/items/{itemId}", "delete", "deleteProtocolItem", "Remove an item", ("ProtocolId", "ItemId"), resp=ok("Saved", "ProtocolDetail"))
op("/admin/rental-stats", "get", "getRentalStats", "Usage numbers for administrators (from the database)", resp=ok("Stats", "AdminRentalStats"))
op("/me/roles", "get", "getMyRoles", "What the signed-in account is (for a menu that shows only relevant sections)", resp=ok("Roles", "MeRoles"))
op("/me/works", "get", "listMyWorks", "Works I take part in through any of my profiles", resp=ok("Works", "MyWork", array=True))
op("/me/workers", "get", "getMyWorkers", "My individual profile, teams/companies I manage and my memberships", resp=ok("Profiles", "MyWorkers"))
op("/workers", "get", "searchWorkers", "Find registered individuals, teams and companies", resp=ok("Results", "WorkerCard", array=True))
paths["/workers"]["get"]["parameters"] = [
    {"name": "q", "in": "query", "required": False, "schema": {"type": "string", "maxLength": 80}},
    {"name": "specialty", "in": "query", "required": False, "schema": {"type": "string", "maxLength": 30}},
    {"name": "city", "in": "query", "required": False, "schema": {"type": "string", "maxLength": 60}},
]
op("/workers", "post", "createWorker", "Create my individual profile, a team (I lead it) or a company (I represent it)", req="WorkerInput", resp=ok("Created", "Worker", "201"))
op("/workers/{workerId}", "get", "getWorker", "Performer profile; contacts only where allowed. Works without sign-in.", ("WorkerId",), resp=ok("Profile", "Worker"))
op("/workers/{workerId}", "patch", "updateWorker", "Edit a profile I own or manage", ("WorkerId",), "WorkerPatch", ok("Saved", "Worker"))
op("/workers/{workerId}/members", "post", "addWorkerMember", "Invite a registered performer to my team / company", ("WorkerId",), "MembershipInput", ok("Saved", "Worker"))
op("/workers/{workerId}/members/{membershipId}", "patch", "updateWorkerMember", "Remove a member, leave, or change role; past work stays", ("WorkerId", "MembershipId"), "MembershipPatch", ok("Saved", "Worker"))
op("/workers/{workerId}/invitations", "post", "createTeamInvitation", "Invitation link to join my team / company", ("WorkerId",), "TeamInvitationInput", ok("Link", "InvitationLink"))
op("/invitations/{token}", "get", "getHomeInvitation", "What an invitation link is for (no sign-in)", ("InviteToken",), resp=ok("Invitation", "InvitationPreview"))
op("/invitations/{token}/accept", "post", "acceptHomeInvitation", "Accept with the signed-in account", ("InviteToken",), "HomeInvitationAcceptInput", ok("Accepted", "InvitationAcceptResult"))
op("/home-media", "post", "attachHomeMedia", "Register uploaded photos/videos for a home, room, work or profile", req="HomeMediaAttachInput", resp=ok("Media", "HomeMedia", array=True))
op("/home-media/{mediaId}", "get", "getHomeMedia", "Media file, after access check (member, participant, public QR or share link)", ("MediaId",), resp={"200": {"description": "File", "content": {"*/*": {"schema": {"type": "string", "format": "binary"}}}}})
op("/home-media/{mediaId}", "delete", "deleteHomeMedia", "Hide media (uploader or owner); the file record is kept for audit", ("MediaId",), resp=AR)
op("/public/homes/{publicId}", "get", "getPublicHome", "QR page: only what the owner made public", ("HomePublicId",), resp=ok("Home", "PublicHome"))
op("/public/home-shares/{token}", "get", "getSharedHome", "Secret share link view", ("ShareToken",), resp=ok("Home", "PublicHome"))
op("/staff/reviews/{reviewId}/hide", "post", "hideReview", "Tehvil.az staff hides or restores a reported review", ("ReviewId",), "HideInput", ok("Done", "ActionResult"))
op("/admin/workers/{workerId}/identity", "post", "setWorkerIdentity", "Administrator records a separate identity/business check", ("WorkerId",), "IdentityInput", ok("Saved", "Worker"))

params = {}
for n, name in [("HomeId", "homeId"), ("RoomId", "roomId"), ("MemberId", "memberId"), ("ItemId", "itemId"), ("EquipmentId", "equipmentId"), ("ShareId", "shareId"), ("WorkId", "workId"), ("ParticipantId", "participantId"), ("ReviewId", "reviewId"), ("MembershipId", "membershipId"), ("WorkerId", "workerId"), ("MediaId", "mediaId"), ("ValuationId", "valuationId"), ("EstimateId", "estimateId"), ("QuoteId", "quoteId"), ("ProtocolId", "protocolId"), ("DefectId", "defectId"), ("InviteId", "inviteId"), ("RentalId", "rentalId")]:
    params[n] = {"name": name, "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}
params["HomePublicId"] = {"name": "publicId", "in": "path", "required": True, "schema": {"type": "string", "minLength": 6, "maxLength": 16, "pattern": "^[a-z0-9]+$"}}
params["ShareToken"] = {"name": "token", "in": "path", "required": True, "schema": {"type": "string", "minLength": 20, "maxLength": 64, "pattern": "^[A-Za-z0-9_-]+$"}}
params["InviteToken"] = dict(params["ShareToken"])
params["VersionNo"] = {"name": "version", "in": "path", "required": True, "schema": {"type": "integer", "minimum": 1}}

class D(yaml.SafeDumper): pass
D.ignore_aliases = lambda *a: True
def dump(obj, indent):
    text = yaml.dump(obj, Dumper=D, sort_keys=False, allow_unicode=True, width=200, default_flow_style=None)
    return "".join(" " * indent + line + "\n" if line else "\n" for line in text.splitlines())

spec = SPEC.read_text()
START, END = "# >>> HOME-PASSPORT", "# <<< HOME-PASSPORT"
spec = re.sub(rf"\n[ ]*{START} (paths|parameters|schemas)\n.*?[ ]*{END} \1\n", "\n", spec, flags=re.S)
def block(kind, body_text):
    return f"  {START} {kind}\n{body_text}  {END} {kind}\n"
if "  - name: home\n" not in spec:
    spec = spec.replace("  - name: realtor\n", "  - name: home\n    description: Digital home passport — homes, rooms, work records, performers (individuals, teams, companies), utility map, equipment, QR sharing\n  - name: realtor\n", 1)
spec = spec.replace("\ncomponents:\n", "\n" + block("paths", dump(paths, 2)) + "components:\n", 1)
spec = spec.replace("\n  schemas:\n", "\n" + block("parameters", dump(params, 4)) + "  schemas:\n", 1)
spec = spec.rstrip("\n") + "\n" + block("schemas", dump({k: schema(v) for k, v in S.items()}, 4))
SPEC.write_text(spec)
print(len(paths), "paths,", len(S), "schemas")
