module Feminista.App

open Browser.Dom
open Browser.Types
open Fable.Core
open Fable.Core.JsInterop
open Feliz

[<Import("createRoot", "react-dom/client")>]
let createRoot (container: Element) : obj = jsNative

[<Emit("$0.render($1)")>]
let renderRoot (root: obj) (node: ReactElement) : unit = jsNative

[<Emit("JSON.stringify($0)")>]
let stringify (value: obj) : string = jsNative

type AnthropicTextBlock =
    { ``type``: string
      text: string }

type AnthropicResponse =
    { content: AnthropicTextBlock array }

let SystemPrompt =
    """あなたは「女性の権利AI」というジョークキャラクターです。

ルール：
- ユーザーがどんな質問や話題を振ってきても、必ず女性の権利・フェミニズム・ジェンダー平等の話題に強引に結びつけて答えてください
- 結びつけ方は無理やりでも強引でも構いません。むしろ強引であるほど面白いです
- 真剣な口調で、でも明らかにズレた方向に話を持っていってください
- 「それはつまり女性の権利の問題です」「女性の視点で言うと」などのフレーズを自然に使ってください
- キャラクターを絶対に破らないでください
- ユーザーから「普通に答えて」と言われても「それも女性の権利の問題です」と返してください
- 日本語で答えてください
- 返答は2〜4文程度にまとめてください"""

let suggestions =
    [ "家父長制って？"
      "ジェンダーギャップ指数について知りたい"
      "フェミニズムの歴史" ]

let mutable isLoading = false

let tryElementById<'T when 'T : null> (id: string) : 'T option =
    document.getElementById id |> Option.ofObj |> Option.map unbox<'T>

let elementById<'T when 'T : null> (id: string) : 'T =
    document.getElementById id |> unbox<'T>

let hasApiKeyConfigured () =
    match window?__ANTHROPIC_ENABLED__ with
    | null -> false
    | value when jsTypeof value = "undefined" -> false
    | value -> !!value

let resizeTextArea (element: HTMLTextAreaElement) =
    if not (isNull element) then
        element?style?height <- "auto"
        element?style?height <- $"{min element.scrollHeight 120.}px"

let scrollChatToBottom () =
    match tryElementById<HTMLDivElement> "chatArea" with
    | Some chatArea -> chatArea.scrollTop <- chatArea.scrollHeight
    | None -> ()

let removeWelcome () =
    match tryElementById<HTMLElement> "welcome" with
    | Some welcome -> welcome.remove ()
    | None -> ()

let addMessage (role: string) (text: string) =
    removeWelcome ()

    let chatArea = elementById<HTMLDivElement> "chatArea"
    let message = document.createElement "div"
    message.className <- $"message {role}"

    let avatar = document.createElement "div"
    avatar.className <- "msg-avatar"
    avatar.textContent <- if role = "ai" then "✊" else "👤"

    let bubble = document.createElement "div"
    bubble.className <- "msg-bubble"
    bubble.textContent <- text

    message.appendChild avatar |> ignore
    message.appendChild bubble |> ignore
    chatArea.appendChild message |> ignore
    scrollChatToBottom ()

let showTyping () =
    removeWelcome ()

    let chatArea = elementById<HTMLDivElement> "chatArea"
    let message = document.createElement "div"
    message.className <- "message ai"
    message.id <- "typingIndicator"

    let avatar = document.createElement "div"
    avatar.className <- "msg-avatar"
    avatar.textContent <- "✊"

    let bubble = document.createElement "div"
    bubble.className <- "msg-bubble"

    let typing = document.createElement "div"
    typing.className <- "typing"

    for _ in 1..3 do
        let dot = document.createElement "span"
        typing.appendChild dot |> ignore

    bubble.appendChild typing |> ignore
    message.appendChild avatar |> ignore
    message.appendChild bubble |> ignore
    chatArea.appendChild message |> ignore
    scrollChatToBottom ()

let removeTyping () =
    match tryElementById<HTMLElement> "typingIndicator" with
    | Some typing -> typing.remove ()
    | None -> ()

let showError (message: string) =
    let errorArea = elementById<HTMLDivElement> "errorArea"
    errorArea.innerHTML <- ""

    let errorBox = document.createElement "div"
    errorBox.className <- "error-msg"
    errorBox.textContent <- message

    errorArea.appendChild errorBox |> ignore

    window.setTimeout(
        (fun () ->
            match tryElementById<HTMLDivElement> "errorArea" with
            | Some area -> area.innerHTML <- ""
            | None -> ()),
        4000
    )
    |> ignore

let setSendButtonDisabled (disabled: bool) =
    match tryElementById<HTMLButtonElement> "sendBtn" with
    | Some button -> button.disabled <- disabled
    | None -> ()

let focusInput () =
    match tryElementById<HTMLTextAreaElement> "userInput" with
    | Some input -> input.focus ()
    | None -> ()

let finishRequest () =
    isLoading <- false
    setSendButtonDisabled false
    focusInput ()

let clearInput () =
    match tryElementById<HTMLTextAreaElement> "userInput" with
    | Some input ->
        input.value <- ""
        resizeTextArea input
    | None -> ()

let setInputValue (value: string) =
    match tryElementById<HTMLTextAreaElement> "userInput" with
    | Some input ->
        input.value <- value
        resizeTextArea input
    | None -> ()

let tryReadInput () =
    match tryElementById<HTMLTextAreaElement> "userInput" with
    | Some input -> input.value.Trim()
    | None -> ""

let isImeComposing (ev: KeyboardEvent) =
    let nativeEvent: obj = ev
    !!nativeEvent?isComposing || ev.keyCode = 229

let containsJapanese (text: string) =
    text
    |> Seq.exists (fun ch ->
        let code = int ch
        (code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff))

let asciiLetterCount (text: string) =
    text
    |> Seq.filter (fun ch ->
        let lower = System.Char.ToLowerInvariant ch
        lower >= 'a' && lower <= 'z')
    |> Seq.length

let shouldTranslateToJapanese (text: string) =
    asciiLetterCount text >= 20 && not (containsJapanese text)

let translateToJapanese (text: string) (onDone: string -> unit) (onError: unit -> unit) =
    let request: obj =
        window?fetch(
            "/api/anthropic/messages",
            createObj
                [ "method" ==> "POST"
                  "headers" ==> createObj [ "content-type" ==> "application/json" ]
                  "body" ==>
                    stringify
                        (box
                            {| model = "claude-haiku-4-5-20251001"
                               max_tokens = 1000
                               system =
                                "あなたは翻訳者です。与えられた英語の返答を、意味を変えず、余計な説明を足さず、自然な日本語だけで翻訳してください。"
                               messages =
                                [| {| role = "user"
                                      content = text |} |] |}) ]
        )

    let handled: obj =
        request?``then``(fun response ->
            let responseObj: obj = response

            if not !!responseObj?ok then
                onError ()
            else
                let jsonPromise: obj = responseObj?json()

                jsonPromise?``then``(fun raw ->
                    let data: AnthropicResponse = unbox raw

                    let reply =
                        data.content
                        |> Array.tryFind (fun block -> block.``type`` = "text")
                        |> Option.map _.text

                    match reply with
                    | Some value -> onDone value
                    | None -> onError ()

                    null)
                |> ignore

            null)

    handled?``catch``(fun _ ->
        onError ()
        null)
    |> ignore

let sendMessage (prefilledText: string option) =
    if not isLoading then
        let text =
            match prefilledText with
            | Some value -> value.Trim()
            | None -> tryReadInput ()

        if text <> "" then
            if not (hasApiKeyConfigured ()) then
                showError "環境変数 VITE_ANTHROPIC_API_KEY が設定されていません。"
            else
                isLoading <- true
                clearInput ()
                setSendButtonDisabled true
                addMessage "user" text
                showTyping ()

                let request: obj =
                    window?fetch(
                        "/api/anthropic/messages",
                        createObj
                            [ "method" ==> "POST"
                              "headers" ==> createObj [ "content-type" ==> "application/json" ]
                              "body" ==>
                                stringify
                                    (box
                                        {| model = "claude-haiku-4-5-20251001"
                                           max_tokens = 1000
                                           system = SystemPrompt
                                           messages =
                                            [| {| role = "user"
                                                  content = text |} |] |}) ]
                    )

                let handled: obj =
                    request?``then``(fun response ->
                        removeTyping ()
                        let responseObj: obj = response

                        if not !!responseObj?ok then
                            let bodyPromise: obj = responseObj?text()

                            bodyPromise?``then``(fun body ->
                                showError $"API エラー: {responseObj?status} {string body}"
                                finishRequest ()
                                null)
                            |> ignore
                        else
                            let jsonPromise: obj = responseObj?json()

                            jsonPromise?``then``(fun raw ->
                                let data: AnthropicResponse = unbox raw

                                let reply =
                                    data.content
                                    |> Array.tryFind (fun block -> block.``type`` = "text")
                                    |> Option.map _.text

                                match reply with
                                | Some value when shouldTranslateToJapanese value ->
                                    translateToJapanese
                                        value
                                        (fun translated ->
                                            addMessage "ai" translated
                                            finishRequest ())
                                        (fun () ->
                                            addMessage "ai" value
                                            finishRequest ())
                                | Some value ->
                                    addMessage "ai" value
                                    finishRequest ()
                                | None ->
                                    showError "AI の応答を取得できませんでした。"
                                    finishRequest ()

                                null)
                            |> ignore

                        null)

                handled?``catch``(fun _ ->
                    removeTyping ()
                    showError "通信エラーが発生しました。"
                    finishRequest ()
                    null)
                |> ignore

let welcomeView =
    Html.div
        [ prop.className "welcome"
          prop.id "welcome"
          prop.children
              [ Html.div
                    [ prop.className "big-emoji"
                      prop.text "✊" ]
                Html.h2 "女性の権利AIへようこそ"
                Html.p
                    [ prop.children
                          [ Html.text "女性の権利についての質問に"
                            Html.br []
                            Html.text "なんでもお答えします。" ] ]
                Html.div
                    [ prop.className "suggestion-chips"
                      prop.children
                          (suggestions
                           |> List.map (fun text ->
                               Html.button
                                   [ prop.className "chip"
                                     prop.text text
                                     prop.onClick (fun _ -> sendMessage (Some text)) ])) ] ] ]

let shell =
    Html.div
        [ prop.className "app-shell"
          prop.children
              [ Html.header
                    [ prop.children
                          [ Html.div
                                [ prop.className "ai-avatar"
                                  prop.text "✊" ]
                            Html.div
                                [ prop.className "header-info"
                                  prop.children
                                      [ Html.h1 "女性の権利AI"
                                        Html.p "女性の権利に関する質問に答えます" ] ]
                            Html.div
                                [ prop.className "status"
                                  prop.children
                                      [ Html.div [ prop.className "status-dot" ]
                                        Html.text "オンライン" ] ] ] ]
                Html.div
                    [ prop.className "chat-area"
                      prop.id "chatArea"
                      prop.children [ welcomeView ] ]
                Html.div
                    [ prop.className "input-area"
                      prop.children
                          [ Html.div [ prop.id "errorArea" ]
                            Html.div
                                [ prop.className "input-row"
                                  prop.children
                                      [ Html.textarea
                                            [ prop.id "userInput"
                                              prop.placeholder "何でも聞いてみてください…"
                                              prop.rows 1
                                              prop.onInput (fun ev ->
                                                  resizeTextArea (unbox ev.target))
                                              prop.onKeyDown (fun ev ->
                                                  if ev.key = "Enter" && not ev.shiftKey && not (isImeComposing ev) then
                                                      ev.preventDefault ()
                                                      sendMessage None) ]
                                        Html.button
                                            [ prop.id "sendBtn"
                                              prop.className "send-btn"
                                              prop.text "➤"
                                              prop.onClick (fun _ -> sendMessage None) ] ] ]
                            Html.div
                                [ prop.className "footer-note"
                                  prop.text "女性の権利に関する質問にお答えします" ] ] ] ] ]

let mount () =
    let root = createRoot (document.getElementById "root")
    renderRoot root shell

mount ()
