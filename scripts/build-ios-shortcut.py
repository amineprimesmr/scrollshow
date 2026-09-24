#!/usr/bin/env python3
"""Construit et signe le raccourci iOS « ScrollShow » (v2 : recréation par l'agent), en français et en anglais.

Usage : python3 scripts/build-ios-shortcut.py  (macOS uniquement, utilise `shortcuts sign`)
Sortie : public/ScrollShow.shortcut (fr) et public/ScrollShow-en.shortcut (en), importables sans lien iCloud.

Flux du raccourci :
  0. Texte = clé API (question d'import : demandée une fois à l'installation)
  1. GET https://scrollshow.io/api/v1/shortcut → { ask } : la préférence du compte (Réglages > API)
  2. Si `ask` a une valeur : liste « Recréer pour mon business » / « Enregistrer seulement » → variable Mode
     (sinon Mode reste vide et le serveur applique la préférence : toujours recréer ou toujours enregistrer)
  3. POST https://scrollshow.io/api/v1/shortcut { url: <entrée>, mode: Mode }
  4. Notification : titre = `title`, texte = `message` (la route répond toujours 200)
  5. Si `openUrl` est présent : l'ouvre (Claude avec le message prêt, ou la page pour connecter
     l'agent). En mode routine, rien ne s'ouvre : l'agent travaille seul.
Sans entrée (lancé à la main), le raccourci lit le presse-papiers.
L'ancien raccourci (POST /api/v1/library) continue de fonctionner.
"""
import plistlib, subprocess, uuid, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENDPOINT = "https://scrollshow.io/api/v1/shortcut"
OBJ = "￼"  # marqueur d'attachement dans les chaînes Shortcuts

LANGS = {
    "fr": {
        "out": ROOT / "public" / "ScrollShow.shortcut",
        "choices": ["Recréer pour mon business", "Enregistrer seulement"],
        "question": "Colle ta clé ScrollShow (Réglages > API > Raccourci iPhone > Créer la clé iPhone)",
    },
    "en": {
        "out": ROOT / "public" / "ScrollShow-en.shortcut",
        "choices": ["Recreate for my business", "Just save it"],
        "question": "Paste your ScrollShow key (Settings > API > iPhone shortcut > Create iPhone key)",
    },
}


def new_uuid():
    return str(uuid.uuid4()).upper()


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


def build(lang, conf):
    key, cfg, ask, lst, choice, req = (new_uuid() for _ in range(6))
    title, msg, open_, if_ask, if_open = (new_uuid() for _ in range(5))
    auth = ("Authorization", token("Bearer " + OBJ, {"{7, 1}": output(key, "Text")}))
    language = ("Accept-Language", token(lang, {}))

    def value_for(name, uuid_, source):
        return {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
            "WFWorkflowActionParameters": {
                "UUID": uuid_,
                "WFGetDictionaryValueType": "Value",
                "WFDictionaryKey": name,
                "WFInput": attachment(output(source, "Contents of URL")),
            },
        }

    def if_has_value(group, uuid_):
        return {
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {
                "GroupingIdentifier": group,
                "WFControlFlowMode": 0,
                "WFCondition": 100,  # « a une valeur »
                "WFInput": {"Type": "Variable", "Variable": attachment(output(uuid_, "Dictionary Value"))},
            },
        }

    def end_if(group):
        return {"WFWorkflowActionIdentifier": "is.workflow.actions.conditional", "WFWorkflowActionParameters": {"GroupingIdentifier": group, "WFControlFlowMode": 2}}

    actions = [
        {"WFWorkflowActionIdentifier": "is.workflow.actions.gettext", "WFWorkflowActionParameters": {"UUID": key, "WFTextActionText": "ss_live_..."}},
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {"UUID": cfg, "ShowHeaders": True, "WFURL": ENDPOINT, "WFHTTPMethod": "GET", "WFHTTPHeaders": dictionary([auth, language])},
        },
        value_for("ask", ask, cfg),
        if_has_value(if_ask, ask),
        {"WFWorkflowActionIdentifier": "is.workflow.actions.list", "WFWorkflowActionParameters": {"UUID": lst, "WFItems": conf["choices"]}},
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.choosefromlist",
            "WFWorkflowActionParameters": {"UUID": choice, "WFInput": attachment(output(lst, "List")), "WFChooseFromListActionPrompt": "ScrollShow"},
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
            "WFWorkflowActionParameters": {"WFVariableName": "Mode", "WFInput": attachment(output(choice, "Chosen Item"))},
        },
        end_if(if_ask),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": req,
                "ShowHeaders": True,
                "WFURL": ENDPOINT,
                "WFHTTPMethod": "POST",
                "WFHTTPBodyType": "JSON",
                "WFHTTPHeaders": dictionary([auth, language]),
                "WFJSONValues": dictionary([
                    ("url", token(OBJ, {"{0, 1}": {"Type": "ExtensionInput"}})),
                    ("mode", token(OBJ, {"{0, 1}": {"Type": "Variable", "VariableName": "Mode"}})),
                ]),
            },
        },
        value_for("title", title, req),
        value_for("message", msg, req),
        value_for("openUrl", open_, req),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
            "WFWorkflowActionParameters": {
                "WFNotificationActionTitle": token(OBJ, {"{0, 1}": output(title, "Dictionary Value")}),
                "WFNotificationActionBody": token(OBJ, {"{0, 1}": output(msg, "Dictionary Value")}),
            },
        },
        if_has_value(if_open, open_),
        {"WFWorkflowActionIdentifier": "is.workflow.actions.openurl", "WFWorkflowActionParameters": {"WFInput": attachment(output(open_, "Dictionary Value"))}},
        end_if(if_open),
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
        "WFWorkflowImportQuestions": [{"ActionIndex": 0, "Category": "Parameter", "ParameterKey": "WFTextActionText", "Text": conf["question"], "DefaultValue": ""}],
        "WFWorkflowActions": actions,
    }

    out = conf["out"]
    tmp = out.with_name(out.stem + ".unsigned.shortcut")
    tmp.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY))
    try:
        subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", str(tmp), "--output", str(out)], check=True)
    finally:
        tmp.unlink(missing_ok=True)
    print("ok", out, out.stat().st_size, "bytes")


for lang, conf in LANGS.items():
    build(lang, conf)
