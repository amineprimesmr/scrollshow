#!/usr/bin/env python3
"""Construit et signe le raccourci iOS « Ajouter à ScrollShow ».

Usage : python3 scripts/build-ios-shortcut.py  (macOS uniquement, utilise `shortcuts sign`)
Sortie : public/ScrollShow.shortcut, importable sur iOS/macOS sans lien iCloud.

Flux du raccourci :
  0. Texte = clé API (question d'import : demandée une fois à l'installation)
  1. POST https://scrollshow.io/api/v1/library { url: <entrée du raccourci> }
  2. Lit `message` dans la réponse
  3. Notification avec ce message
Sans entrée (lancé à la main), le raccourci lit le presse-papiers.
"""
import plistlib, subprocess, sys, uuid, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "ScrollShow.shortcut"
ENDPOINT = "https://scrollshow.io/api/v1/library"
OBJ = "￼"  # marqueur d'attachement dans les chaînes Shortcuts

KEY_UUID = str(uuid.uuid4()).upper()
REQ_UUID = str(uuid.uuid4()).upper()
MSG_UUID = str(uuid.uuid4()).upper()

def token(string, attachments):
    return {"Value": {"string": string, "attachmentsByRange": attachments}, "WFSerializationType": "WFTextTokenString"}

def output(uuid_, name):
    return {"Type": "ActionOutput", "OutputUUID": uuid_, "OutputName": name}

def attachment(value):
    return {"Value": value, "WFSerializationType": "WFTextTokenAttachment"}

def dictionary(items):
    return {
        "Value": {"WFDictionaryFieldValueItems": [{"WFItemType": 0, "WFKey": token(k, {}), "WFValue": v} for k, v in items]},
        "WFSerializationType": "WFDictionaryFieldValue",
    }

actions = [
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
        "WFWorkflowActionParameters": {"UUID": KEY_UUID, "WFTextActionText": "ss_live_..."},
    },
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": REQ_UUID,
            "ShowHeaders": True,
            "WFURL": ENDPOINT,
            "WFHTTPMethod": "POST",
            "WFHTTPBodyType": "JSON",
            "WFHTTPHeaders": dictionary([
                ("Authorization", token("Bearer " + OBJ, {"{7, 1}": output(KEY_UUID, "Text")})),
                ("Accept-Language", token("fr", {})),
            ]),
            "WFJSONValues": dictionary([
                ("url", token(OBJ, {"{0, 1}": {"Type": "ExtensionInput"}})),
            ]),
        },
    },
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
        "WFWorkflowActionParameters": {
            "UUID": MSG_UUID,
            "WFGetDictionaryValueType": "Value",
            "WFDictionaryKey": "message",
            "WFInput": attachment(output(REQ_UUID, "Contents of URL")),
        },
    },
    {
        "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
        "WFWorkflowActionParameters": {
            "WFNotificationActionTitle": "ScrollShow",
            "WFNotificationActionBody": token(OBJ, {"{0, 1}": output(MSG_UUID, "Dictionary Value")}),
        },
    },
]

workflow = {
    "WFWorkflowClientVersion": "2607",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 2071128575, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowTypes": ["ActionExtension"],
    "WFWorkflowHasShortcutInputVariables": True,
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowInputContentItemClasses": [
        "WFURLContentItem", "WFStringContentItem", "WFSafariWebPageContentItem", "WFArticleContentItem", "WFRichTextContentItem",
    ],
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowNoInputBehavior": {"Name": "WFWorkflowNoInputBehaviorGetClipboard"},
    "WFWorkflowImportQuestions": [{
        "ActionIndex": 0,
        "Category": "Parameter",
        "ParameterKey": "WFTextActionText",
        "Text": "Colle ta clé API ScrollShow (Réglages > API > Raccourci iPhone)",
        "DefaultValue": "",
    }],
    "WFWorkflowActions": actions,
}

tmp = OUT.with_name("ScrollShow.unsigned.shortcut")
tmp.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY))
try:
    subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", str(tmp), "--output", str(OUT)], check=True)
finally:
    tmp.unlink(missing_ok=True)
print("ok", OUT, OUT.stat().st_size, "bytes")
