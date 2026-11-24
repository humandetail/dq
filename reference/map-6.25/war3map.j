//W3x2lni Data: 2019-10-02 22:05:06.403
globals
    constant boolean LIBRARY_DzAPI=true

    integer GAME_MODE = 0
    //是否限制等级，主要用于debug模式测试和比赛模式的开关图鉴功能
    boolean IfAstrict_LV = true
    integer WeekTurn = 0
    string Task_Reward_15
    string Task_Reward_25
    string Task_Reward_35

    string Gold_Record_One_Lv3
    string Old_Gold_Record_One_Lv3

    //玩家工会名字
    string Guide_Name_0 = ""
    string Guide_Name_1 = ""
    string Guide_Name_2 = ""
    string Guide_Name_3 = ""

    integer Map_Lv_0 = 0
    integer Map_Lv_1 = 0
    integer Map_Lv_2 = 0
    integer Map_Lv_3 = 0
    
    integer score0
    integer score1
    integer score2
    integer score3

    integer scoreNew0
    integer scoreNew1
    integer scoreNew2
    integer scoreNew3

    integer abyss_old_0
    integer abyss_old_1
    integer abyss_old_2
    integer abyss_old_3

    integer abyss0
    integer abyss1
    integer abyss2
    integer abyss3

    integer abyssNew0
    integer abyssNew1
    integer abyssNew2
    integer abyssNew3

    integer SkinPiece0
    integer SkinPiece1
    integer SkinPiece2
    integer SkinPiece3

    string DotaTDSprStr0
    string DotaTDSprStr1
    string DotaTDSprStr2
    string DotaTDSprStr3

    string DotaTDSumStr0
    string DotaTDSumStr1
    string DotaTDSumStr2
    string DotaTDSumStr3
    
    integer MidAutumnNewScore0
    integer MidAutumnNewScore1
    integer MidAutumnNewScore2
    integer MidAutumnNewScore3

    integer CScore0 = 0
    integer CScore1 = 0
    integer CScore2 = 0
    integer CScore3 = 0

    //中秋积分
    integer MidAutumnScore0
    integer MidAutumnScore1
    integer MidAutumnScore2
    integer MidAutumnScore3
    //活动积分
    integer ActScore0
    integer ActScore1
    integer ActScore2
    integer ActScore3

    integer OpenGiftNum0
    integer OpenGiftNum1
    integer OpenGiftNum2
    integer OpenGiftNum3

    integer endless_old_one_0
    integer endless_old_one_1
    integer endless_old_one_2
    integer endless_old_one_3

    integer endless_old_team_0
    integer endless_old_team_1
    integer endless_old_team_2
    integer endless_old_team_3

    integer endless_one_0
    integer endless_one_1
    integer endless_one_2
    integer endless_one_3

    integer endless_one_New0
    integer endless_one_New1
    integer endless_one_New2
    integer endless_one_New3

    integer endless_team_0
    integer endless_team_1
    integer endless_team_2
    integer endless_team_3

    integer endless_team_New0
    integer endless_team_New1
    integer endless_team_New2
    integer endless_team_New3

    integer isSuccessLoad_0 = 0
    integer isSuccessLoad_1 = 0
    integer isSuccessLoad_2 = 0
    integer isSuccessLoad_3 = 0
    string array player_0_item
    string array player_1_item
    string array player_2_item
    string array player_3_item

    string array Item_All_Shop
    string array Model_List_0
    string array Model_List_1
    string array Model_List_2
    string array Model_List_3

    boolean array Has_VIP_Player
    string BAN_Player_Data_0 = ""
    string BAN_Player_Data_1 = ""
    string BAN_Player_Data_2 = ""
    string BAN_Player_Data_3 = ""
    real array BAN_Hero_Y
    timer array NoticeActions

    string array ScoreSkin_Player_0
    string array ScoreSkin_Player_1
    string array ScoreSkin_Player_2
    string array ScoreSkin_Player_3

    integer ScoreSkin_Index = 0

    string Model_Buy_Key = ""
    string Model_Buy_Value = ""

    
    string Season_One_Key_Old = "endlessoneF6"
    string Season_Team_Key_Old = "endlessteamF6"
    string Season_Abyss_Key_Old = "abyssF6"

    string Season_One_Key = "endlessOneF7"
    string Season_Team_Key = "endlessTeamF7"
    string Season_Abyss_Key = "abyssF7"

    string GoldRecord_Str = "GoldRecord"

    boolean Frame_Bg_flag = false
    integer Btn_UI_Open
    integer Btn_UI_Close
    integer Tip_Bg
    integer Tip_Text
    integer array Dmg_UI_Bg
    integer array Dmg_UI
    integer array Dmg_UI_Text_Desc
    integer array Dmg_UI_Text_Player
    real array Dmg_UI_Count
    string array Dmg_Desc
    string array Dmg_Player

    trigger Rank_Damage_Show_Trig
    trigger Rank_Damage_Hide_Trig
    trigger trig

    integer Btn_TuJian_Open
    integer Btn_Show_Task
    integer Btn_Eff
    integer udg_TuJian_Bg
    integer array Choose_Item_ID
    player Buy_Weight_Player
    integer Buy_Weight_ItemID
    integer Weight_Update_Player = 0
    integer Weight_Update_ItemID = 0
    player Choose_Hero_Player
    integer Choose_Hero_ItemID
    integer Frame_ChooseHero
    integer Hero_Tip
    integer Hero_Tip_Text = 0
    integer Task_Reward_PlayerID = 0
    integer Task_Reward_ItemID = 0

    hashtable HSTB

    constant integer TB_TYPE_HERO_STR = 0
    constant integer TB_TYPE_HERO_AGI = 1
    constant integer TB_TYPE_HERO_INT = 2
    constant integer TB_TYPE_HERO_WEIGHT_0 = 3
    constant integer TB_TYPE_HERO_WEIGHT_1 = 4
    constant integer TB_TYPE_HERO_WEIGHT_2 = 5
    constant integer TB_TYPE_HERO_WEIGHT_3 = 6
    constant integer TB_ITEM_ID = 7
    constant integer TB_Ability_Tips = 8
    constant integer Wait_Choose_Hero_0 = 9
    constant integer Wait_Choose_Hero_1 = 10
    constant integer Wait_Choose_Hero_2 = 11
    constant integer Wait_Choose_Hero_3 = 12
    constant integer TB_HERO_ID = 13
    constant integer TB_BAN_HERO_0 = 14
    constant integer TB_BAN_HERO_1 = 15
    constant integer TB_BAN_HERO_2 = 16
    constant integer TB_BAN_HERO_3 = 17
    constant integer TB_NOTICE = 18
    constant integer TB_REWARD_ITEM_0 = 19
    constant integer TB_REWARD_ITEM_1 = 20
    constant integer TB_REWARD_ITEM_2 = 21
    constant integer TB_REWARD_ITEM_3 = 22
    constant integer TB_REWARD_SHOW = 23
    constant integer TB_REWARD_GET = 24

    constant boolean LIBRARY_YDWEYDWEJapiScript=true
endglobals

	native DzGetMouseTerrainX takes nothing returns real
    native DzGetMouseTerrainY takes nothing returns real
    native DzGetMouseTerrainZ takes nothing returns real
    native DzIsMouseOverUI takes nothing returns boolean
    native DzGetMouseX takes nothing returns integer
    native DzGetMouseY takes nothing returns integer
    native DzGetMouseXRelative takes nothing returns integer
    native DzGetMouseYRelative takes nothing returns integer
    native DzSetMousePos takes integer x, integer y returns nothing
    native DzTriggerRegisterMouseEvent takes trigger trig, integer btn, integer status, boolean sync, string func returns nothing
    native DzTriggerRegisterMouseEventByCode takes trigger trig, integer btn, integer status, boolean sync, code funcHandle returns nothing
    native DzTriggerRegisterKeyEvent takes trigger trig, integer key, integer status, boolean sync, string func returns nothing
    native DzTriggerRegisterKeyEventByCode takes trigger trig, integer key, integer status, boolean sync, code funcHandle returns nothing
    native DzTriggerRegisterMouseWheelEvent takes trigger trig, boolean sync, string func returns nothing
    native DzTriggerRegisterMouseWheelEventByCode takes trigger trig, boolean sync, code funcHandle returns nothing
    native DzTriggerRegisterMouseMoveEvent takes trigger trig, boolean sync, string func returns nothing
    native DzTriggerRegisterMouseMoveEventByCode takes trigger trig, boolean sync, code funcHandle returns nothing
    native DzGetTriggerKey takes nothing returns integer
    native DzGetWheelDelta takes nothing returns integer
    native DzIsKeyDown takes integer iKey returns boolean
    native DzGetTriggerKeyPlayer takes nothing returns player
    native DzGetWindowWidth takes nothing returns integer
    native DzGetWindowHeight takes nothing returns integer
    native DzGetWindowX takes nothing returns integer
    native DzGetWindowY takes nothing returns integer
    native DzTriggerRegisterWindowResizeEvent takes trigger trig, boolean sync, string func returns nothing
    native DzTriggerRegisterWindowResizeEventByCode takes trigger trig, boolean sync, code funcHandle returns nothing
    native DzIsWindowActive takes nothing returns boolean
    native DzDestructablePosition takes destructable d, real x, real y returns nothing
    native DzSetUnitPosition takes unit whichUnit, real x, real y returns nothing
    native DzExecuteFunc takes string funcName returns nothing
    native DzGetUnitUnderMouse takes nothing returns unit
    native DzSetUnitTexture takes unit whichUnit, string path, integer texId returns nothing
    native DzSetMemory takes integer address, real value returns nothing
    native DzSetUnitID takes unit whichUnit, integer id returns nothing
    native DzSetUnitModel takes unit whichUnit, string path returns nothing
    native DzSetWar3MapMap takes string map returns nothing
    native DzTriggerRegisterSyncData takes trigger trig, string prefix, boolean server returns nothing
    native DzSyncData takes string prefix, string data returns nothing
    native DzGetTriggerSyncData takes nothing returns string
    native DzGetTriggerSyncPlayer takes nothing returns player
    native DzFrameHideInterface takes nothing returns nothing
    native DzFrameEditBlackBorders takes real upperHeight, real bottomHeight returns nothing
    native DzFrameGetPortrait takes nothing returns integer
    native DzFrameGetMinimap takes nothing returns integer
    native DzFrameGetCommandBarButton takes integer row, integer column returns integer
    native DzFrameGetHeroBarButton takes integer buttonId returns integer
    native DzFrameGetHeroHPBar takes integer buttonId returns integer
    native DzFrameGetHeroManaBar takes integer buttonId returns integer
    native DzFrameGetItemBarButton takes integer buttonId returns integer
    native DzFrameGetMinimapButton takes integer buttonId returns integer
    native DzFrameGetUpperButtonBarButton takes integer buttonId returns integer
    native DzFrameGetTooltip takes nothing returns integer
    native DzFrameGetChatMessage takes nothing returns integer
    native DzFrameGetUnitMessage takes nothing returns integer
    native DzFrameGetTopMessage takes nothing returns integer
    native DzGetColor takes integer r, integer g, integer b, integer a returns integer
    native DzFrameSetUpdateCallback takes string func returns nothing
    native DzFrameSetUpdateCallbackByCode takes code funcHandle returns nothing
    native DzFrameShow takes integer frame, boolean enable returns nothing
    native DzCreateFrame takes string frame, integer parent, integer id returns integer
    native DzCreateSimpleFrame takes string frame, integer parent, integer id returns integer
    native DzDestroyFrame takes integer frame returns nothing
    native DzLoadToc takes string fileName returns nothing
    native DzFrameSetPoint takes integer frame, integer point, integer relativeFrame, integer relativePoint, real x, real y returns nothing
    native DzFrameSetAbsolutePoint takes integer frame, integer point, real x, real y returns nothing
    native DzFrameClearAllPoints takes integer frame returns nothing
    native DzFrameSetEnable takes integer name, boolean enable returns nothing
    native DzFrameSetScript takes integer frame, integer eventId, string func, boolean sync returns nothing
    native DzFrameSetScriptByCode takes integer frame, integer eventId, code funcHandle, boolean sync returns nothing
    native DzGetTriggerUIEventPlayer takes nothing returns player
    native DzGetTriggerUIEventFrame takes nothing returns integer
    native DzFrameFindByName takes string name, integer id returns integer
    native DzSimpleFrameFindByName takes string name, integer id returns integer
    native DzSimpleFontStringFindByName takes string name, integer id returns integer
    native DzSimpleTextureFindByName takes string name, integer id returns integer
    native DzGetGameUI takes nothing returns integer
    native DzClickFrame takes integer frame returns nothing
    native DzSetCustomFovFix takes real value returns nothing
    native DzEnableWideScreen takes boolean enable returns nothing
    native DzFrameSetText takes integer frame, string text returns nothing
    native DzFrameGetText takes integer frame returns string
    native DzFrameSetTextSizeLimit takes integer frame, integer size returns nothing
    native DzFrameGetTextSizeLimit takes integer frame returns integer
    native DzFrameSetTextColor takes integer frame, integer color returns nothing
    native DzGetMouseFocus takes nothing returns integer
    native DzFrameGetHeight takes integer frame returns real
    native DzFrameSetAllPoints takes integer frame, integer relativeFrame returns boolean
    native DzFrameSetFocus takes integer frame, boolean enable returns boolean
    native DzFrameSetModel takes integer frame, string modelFile, integer modelType, integer flag returns nothing
    native DzFrameGetEnable takes integer frame returns boolean
    native DzFrameSetAlpha takes integer frame, integer alpha returns nothing
    native DzFrameGetAlpha takes integer frame returns integer
    native DzFrameSetAnimate takes integer frame, integer animId, boolean autocast returns nothing
    native DzFrameSetAnimateOffset takes integer frame, real offset returns nothing
    native DzFrameSetTexture takes integer frame, string texture, integer flag returns nothing
    native DzFrameSetScale takes integer frame, real scale returns nothing
    native DzFrameSetTooltip takes integer frame, integer tooltip returns nothing
    native DzFrameCageMouse takes integer frame, boolean enable returns nothing
    native DzFrameGetValue takes integer frame returns real
    native DzFrameSetMinMaxValue takes integer frame, real minValue, real maxValue returns nothing
    native DzFrameSetStepValue takes integer frame, real step returns nothing
    native DzFrameSetValue takes integer frame, real value returns nothing
    native DzFrameSetSize takes integer frame, real w, real h returns nothing
    native DzCreateFrameByTagName takes string frameType, string name, integer parent, string template, integer id returns integer
    native DzFrameSetVertexColor takes integer frame, integer color returns nothing
	native DzAPI_Map_SaveServerValue takes player whichPlayer, string key, string value returns boolean
    native DzAPI_Map_GetServerValue takes player whichPlayer, string key returns string
    native DzAPI_Map_Ladder_SetStat takes player whichPlayer, string key, string value returns nothing
    native DzAPI_Map_IsRPGLadder takes nothing returns boolean
    native DzAPI_Map_GetGameStartTime takes nothing returns integer
    native DzAPI_Map_Stat_SetStat takes player whichPlayer, string key, string value returns nothing
    native DzAPI_Map_GetMatchType takes nothing returns integer
    native DzAPI_Map_Ladder_SetPlayerStat takes player whichPlayer, string key, string value returns nothing
	native DzAPI_Map_GetServerValueErrorCode takes player whichPlayer returns integer
    native DzAPI_Map_GetLadderLevel takes player whichPlayer returns integer
	native DzAPI_Map_IsRedVIP takes player whichPlayer returns boolean
	native DzAPI_Map_IsBlueVIP takes player whichPlayer returns boolean
	native DzAPI_Map_GetLadderRank takes player whichPlayer returns integer
	native DzAPI_Map_GetMapLevelRank takes player whichPlayer returns integer
	native DzAPI_Map_GetGuildName takes player whichPlayer returns string
	native DzAPI_Map_GetGuildRole takes player whichPlayer returns integer
	native DzAPI_Map_IsRPGLobby takes nothing returns boolean
	native DzAPI_Map_GetMapLevel takes player whichPlayer returns integer
	native DzAPI_Map_MissionComplete takes player whichPlayer, string key, string value returns nothing
	native DzAPI_Map_GetActivityData takes nothing returns string
	native DzAPI_Map_GetMapConfig takes string key returns string
	native DzAPI_Map_HasMallItem takes player whichPlayer, string key returns boolean
	native DzAPI_Map_SavePublicArchive takes player whichPlayer, string key, string value returns boolean
	native DzAPI_Map_GetPublicArchive takes player whichPlayer, string key returns string
	native DzAPI_Map_UseConsumablesItem takes player whichPlayer, string key returns nothing
	native DzAPI_Map_OrpgTrigger takes player whichPlayer, string key returns nothing
	native DzAPI_Map_GetServerArchiveDrop takes player whichPlayer, string key returns string
	native DzAPI_Map_GetServerArchiveEquip takes player whichPlayer, string key returns integer
    native RequestExtraIntegerData takes integer dataType, player whichPlayer, string param1, string param2, boolean param3, integer param4, integer param5, integer param6 returns integer
	native RequestExtraBooleanData takes integer dataType, player whichPlayer, string param1, string param2, boolean param3, integer param4, integer param5, integer param6 returns boolean
	native RequestExtraStringData takes integer dataType, player whichPlayer, string param1, string param2, boolean param3, integer param4, integer param5, integer param6 returns string
	native RequestExtraRealData takes integer dataType, player whichPlayer, string param1, string param2, boolean param3, integer param4, integer param5, integer param6 returns real
    native EXGetItemDataString takes integer ItemTypeId, integer Type returns string
    native EXExecuteScript takes string script returns string
//library BzAPI:
  

    function DzTriggerRegisterMouseEventTrg takes trigger trg,integer status,integer btn returns nothing
        if trg == null then
            return
        endif
        call DzTriggerRegisterMouseEvent(trg, btn, status, true, null)
    endfunction
    function DzTriggerRegisterKeyEventTrg takes trigger trg,integer status,integer btn returns nothing
        if trg == null then
            return
        endif
        call DzTriggerRegisterKeyEvent(trg, btn, status, true, null)
    endfunction
    function DzTriggerRegisterMouseMoveEventTrg takes trigger trg returns nothing
        if trg == null then
            return
        endif
        call DzTriggerRegisterMouseMoveEvent(trg, true, null)
    endfunction
    function DzTriggerRegisterMouseWheelEventTrg takes trigger trg returns nothing
        if trg == null then
            return
        endif
        call DzTriggerRegisterMouseWheelEvent(trg, true, null)
    endfunction
    function DzTriggerRegisterWindowResizeEventTrg takes trigger trg returns nothing
        if trg == null then
            return
        endif
        call DzTriggerRegisterWindowResizeEvent(trg, true, null)
    endfunction
    function DzF2I takes integer i returns integer
        return i
    endfunction
    function DzI2F takes integer i returns integer
        return i
    endfunction
    function DzK2I takes integer i returns integer
        return i
    endfunction
    function DzI2K takes integer i returns integer
        return i
    endfunction

//library BzAPI ends

//library DzAPI:

























 function GetPlayerServerValueSuccess takes player whichPlayer returns boolean
		if ( DzAPI_Map_GetServerValueErrorCode(whichPlayer) == 0 ) then
			return true
		else
			return false
		endif
	endfunction
  function DzAPI_Map_StoreInteger takes player whichPlayer,string key,integer value returns nothing
        set key="I" + key
        call DzAPI_Map_SaveServerValue(whichPlayer, key, I2S(value))
        set key=null
        set whichPlayer=null
    endfunction
    function DzAPI_Map_GetStoredInteger takes player whichPlayer,string key returns integer
        local integer value
        set key="I" + key
        set value=S2I(DzAPI_Map_GetServerValue(whichPlayer, key))
        set key=null
        set whichPlayer=null
        return value
    endfunction
    function DzAPI_Map_StoreReal takes player whichPlayer,string key,real value returns nothing
        set key="R" + key
        call DzAPI_Map_SaveServerValue(whichPlayer, key, R2S(value))
        set key=null
        set whichPlayer=null
    endfunction
    function DzAPI_Map_GetStoredReal takes player whichPlayer,string key returns real
        local real value
        set key="R" + key
        set value=S2R(DzAPI_Map_GetServerValue(whichPlayer, key))
        set key=null
        set whichPlayer=null
        return value
    endfunction
    function DzAPI_Map_StoreBoolean takes player whichPlayer,string key,boolean value returns nothing
        set key="B" + key
        if ( value ) then
            call DzAPI_Map_SaveServerValue(whichPlayer, key, "1")
        else
            call DzAPI_Map_SaveServerValue(whichPlayer, key, "0")
        endif
        set key=null
        set whichPlayer=null
    endfunction
    function DzAPI_Map_GetStoredBoolean takes player whichPlayer,string key returns boolean
        local boolean value
        set key="B" + key
        set key=DzAPI_Map_GetServerValue(whichPlayer, key)
        if ( key == "1" ) then
            set value=true
        else
            set value=false
        endif
        set key=null
        set whichPlayer=null
        return value
    endfunction
    function DzAPI_Map_StoreString takes player whichPlayer,string key,string value returns nothing
        set key="S" + key
        call DzAPI_Map_SaveServerValue(whichPlayer, key, value)
        set key=null
        set whichPlayer=null
    endfunction
    function DzAPI_Map_GetStoredString takes player whichPlayer,string key returns string
        return DzAPI_Map_GetServerValue(whichPlayer, "S" + key)
    endfunction
 function DzAPI_Map_GetStoredUnitType takes player whichPlayer,string key returns integer
        local integer value
        set key="I" + key
        set value=S2I(DzAPI_Map_GetServerValue(whichPlayer, key))
        set key=null
        set whichPlayer=null
        return value
    endfunction
 function DzAPI_Map_GetStoredAbilityId takes player whichPlayer,string key returns integer
        local integer value
        set key="I" + key
        set value=S2I(DzAPI_Map_GetServerValue(whichPlayer, key))
        set key=null
        set whichPlayer=null
        return value
    endfunction
    function DzAPI_Map_FlushStoredMission takes player whichPlayer,string key returns nothing
        call DzAPI_Map_SaveServerValue(whichPlayer, key, null)
        set key=null
        set whichPlayer=null
    endfunction
    function DzAPI_Map_Ladder_SubmitIntegerData takes player whichPlayer,string key,integer value returns nothing
        call DzAPI_Map_Ladder_SetStat(whichPlayer, key, I2S(value))
    endfunction
    function DzAPI_Map_Stat_SubmitUnitIdData takes player whichPlayer,string key,integer value returns nothing
        if ( value == 0 ) then
            //call DzAPI_Map_Ladder_SetStat(whichPlayer,key,"0")
        else
            call DzAPI_Map_Ladder_SetStat(whichPlayer, key, I2S(value))
        endif
    endfunction
    function DzAPI_Map_Stat_SubmitUnitData takes player whichPlayer,string key,unit value returns nothing
        call DzAPI_Map_Stat_SubmitUnitIdData(whichPlayer , key , GetUnitTypeId(value))
    endfunction
    function DzAPI_Map_Ladder_SubmitAblityIdData takes player whichPlayer,string key,integer value returns nothing
        if ( value == 0 ) then
            //call DzAPI_Map_Ladder_SetStat(whichPlayer,key,"0")
        else
            call DzAPI_Map_Ladder_SetStat(whichPlayer, key, I2S(value))
        endif
    endfunction
    function DzAPI_Map_Ladder_SubmitItemIdData takes player whichPlayer,string key,integer value returns nothing
        local string S
        if ( value == 0 ) then
            set S="0"
        else
            set S=I2S(value)
            call DzAPI_Map_Ladder_SetStat(whichPlayer, key, S)
        endif
        //call DzAPI_Map_Ladder_SetStat(whichPlayer,key,S)
        set S=null
        set whichPlayer=null
    endfunction
    function DzAPI_Map_Ladder_SubmitItemData takes player whichPlayer,string key,item value returns nothing
        call DzAPI_Map_Ladder_SubmitItemIdData(whichPlayer , key , GetItemTypeId(value))
    endfunction
    function DzAPI_Map_Ladder_SubmitBooleanData takes player whichPlayer,string key,boolean value returns nothing
        if ( value ) then
            call DzAPI_Map_Ladder_SetStat(whichPlayer, key, "1")
        else
            call DzAPI_Map_Ladder_SetStat(whichPlayer, key, "0")
        endif
    endfunction
    function DzAPI_Map_Ladder_SubmitTitle takes player whichPlayer,string value returns nothing
        call DzAPI_Map_Ladder_SetStat(whichPlayer, value, "1")
    endfunction
 function DzAPI_Map_Ladder_SubmitPlayerRank takes player whichPlayer,integer value returns nothing
        call DzAPI_Map_Ladder_SetPlayerStat(whichPlayer, "RankIndex", I2S(value))
    endfunction
 function DzAPI_Map_Ladder_SubmitPlayerExtraExp takes player whichPlayer,integer value returns nothing
        call DzAPI_Map_Ladder_SetStat(whichPlayer, "ExtraExp", I2S(value))
	endfunction
    function DzAPI_Map_IsRPGQuickMatch takes nothing returns boolean
		return RequestExtraBooleanData(40, null, null, null, false, 0, 0, 0)
	endfunction

//library DzAPI ends
function Get_Item_Data takes integer itemID, string pro returns string
    return EXExecuteScript("(require'jass.slk').item[" + I2S(itemID) + "]." + pro)
endfunction
function Get_Unit_Data takes integer unitID, string pro returns string
    return EXExecuteScript("(require'jass.slk').unit[" + I2S(unitID) + "]." + pro)
endfunction
function Get_Ability_Data takes integer abilityID, string pro returns string
    return EXExecuteScript("(require'jass.slk').ability[" + I2S(abilityID) + "]." + pro)
endfunction

function StrStr takes string str1, string str2 returns integer
    local integer length1 = StringLength(str1)
    local integer length2 = StringLength(str2)
    local integer count = length1 - length2
    local integer index = 0
    loop
        exitwhen index > count
        if (SubString(str1, index, index+length2) == str2) then
            return index
        endif
        set index = index + 1
    endloop
    return -1
endfunction

function S2ID takes string s returns integer
    local string d = "0123456789"
    local integer di = 48
    local string u = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    local integer ui = 65
    local string l = "abcdefghijklmnopqrstuvwxyz"
    local integer li = 97
    local integer index = 0
    local integer count = StringLength(s)
    local integer result = 0
    local string c
    loop 
        exitwhen index >= count
        set result = result * 256
        set c = SubString(s, index, index+1)
        if(StrStr(d,c) != -1)then
        set result = result + di + StrStr(d,c)
        elseif(StrStr(u,c) != -1)then
        set result = result + ui + StrStr(u,c)
        elseif(StrStr(l,c) != -1)then
        set result = result + li + StrStr(l,c)
        endif
        set index = index + 1
    endloop
    return result
endfunction

function DzAPI_Map_Global_GetStoreString takes string key returns string
  //call DisplayTextToPlayer(GetLocalPlayer(), 0, 0, "|cffffcc00地图等级大于5级开放该功能！|r")
  return RequestExtraStringData(36, GetLocalPlayer(), key, null, false, 0, 0, 0)
endfunction

function DzAPI_Map_Global_StoreString takes string key,string value returns nothing
	call RequestExtraStringData(37, GetLocalPlayer(), key, value, false, 0, 0, 0)
endfunction

function DzAPI_Map_Global_SetGold_RecordString takes nothing returns nothing
   call DzAPI_Map_Global_StoreString(GoldRecord_Str, Gold_Record_One_Lv3)
   call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DzAPI_Map_Global_UpdateGold_RecordString takes nothing returns nothing
    //call DisplayTextToPlayer(GetLocalPlayer(), 0, 0, "|cffffcc00地图等级大于5级开放该功能！|r")
    set Gold_Record_One_Lv3 = DzGetTriggerSyncData()
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 1112 )
endfunction

function DZAPI_InitData takes nothing returns nothing
    local integer index = 0
    local string tempPlayerSkinStr = ""
    local string indexSTR = ""
    local string WeekSSR_str = ""
    local string BAN_string = ""
    local string realID = ""
    local string charString = ""

    if(DzAPI_Map_IsRPGQuickMatch()) then
        set GAME_MODE = DzAPI_Map_GetMatchType()
    else
        call DoNothing()
    endif
    set Task_Reward_15 = DzAPI_Map_GetMapConfig("TaskItem15")
    set Task_Reward_25 = DzAPI_Map_GetMapConfig("TaskItem25")
    set Task_Reward_35 = DzAPI_Map_GetMapConfig("TaskItem35")
    set WeekSSR_str = DzAPI_Map_GetMapConfig("WeekSSR")
    if "" == WeekSSR_str then
        set WeekSSR_str = "0"
    else
    endif
    set WeekTurn = S2I(WeekSSR_str)

    set Gold_Record_One_Lv3 = DzAPI_Map_Global_GetStoreString(GoldRecord_Str)
    set Old_Gold_Record_One_Lv3 = Gold_Record_One_Lv3

    set Map_Lv_0 = DzAPI_Map_GetMapLevel(Player(0))
    set Map_Lv_1 = DzAPI_Map_GetMapLevel(Player(1))
    set Map_Lv_2 = DzAPI_Map_GetMapLevel(Player(2))
    set Map_Lv_3 = DzAPI_Map_GetMapLevel(Player(3))

    //------------公会逻辑--------------

    set Guide_Name_0 = DzAPI_Map_GetGuildName(Player(0))
    set Guide_Name_1 = DzAPI_Map_GetGuildName(Player(1))
    set Guide_Name_2 = DzAPI_Map_GetGuildName(Player(2))
    set Guide_Name_3 = DzAPI_Map_GetGuildName(Player(3))

    //-----------------------------------

    set score0 = S2I(DzAPI_Map_GetServerValue(Player(0), "score"))
    set score1 = S2I(DzAPI_Map_GetServerValue(Player(1), "score"))
    set score2 = S2I(DzAPI_Map_GetServerValue(Player(2), "score"))
    set score3 = S2I(DzAPI_Map_GetServerValue(Player(3), "score"))

    set scoreNew0 = 0
    set scoreNew1 = 0
    set scoreNew2 = 0
    set scoreNew3 = 0

    set SkinPiece0 = S2I(DzAPI_Map_GetServerValue(Player(0), "SkinPiece"))
    set SkinPiece1 = S2I(DzAPI_Map_GetServerValue(Player(1), "SkinPiece"))
    set SkinPiece2 = S2I(DzAPI_Map_GetServerValue(Player(2), "SkinPiece"))
    set SkinPiece3 = S2I(DzAPI_Map_GetServerValue(Player(3), "SkinPiece"))

    set DotaTDSprStr0 = DzAPI_Map_GetServerValue(Player(0), "DotaTDSprStr")
    set DotaTDSprStr1 = DzAPI_Map_GetServerValue(Player(1), "DotaTDSprStr")
    set DotaTDSprStr2 = DzAPI_Map_GetServerValue(Player(2), "DotaTDSprStr")
    set DotaTDSprStr3 = DzAPI_Map_GetServerValue(Player(3), "DotaTDSprStr")

    set DotaTDSumStr0 = DzAPI_Map_GetServerValue(Player(0), "DotaTDSumStr")
    set DotaTDSumStr1 = DzAPI_Map_GetServerValue(Player(1), "DotaTDSumStr")
    set DotaTDSumStr2 = DzAPI_Map_GetServerValue(Player(2), "DotaTDSumStr")
    set DotaTDSumStr3 = DzAPI_Map_GetServerValue(Player(3), "DotaTDSumStr")

    set ActScore0 = S2I(DzAPI_Map_GetServerValue(Player(0), "ActScore0"))
    set ActScore1 = S2I(DzAPI_Map_GetServerValue(Player(1), "ActScore0"))
    set ActScore2 = S2I(DzAPI_Map_GetServerValue(Player(2), "ActScore0"))
    set ActScore3 = S2I(DzAPI_Map_GetServerValue(Player(3), "ActScore0"))

    set OpenGiftNum0 = S2I(DzAPI_Map_GetServerValue(Player(0), "OpenGiftNum"))
    set OpenGiftNum1 = S2I(DzAPI_Map_GetServerValue(Player(1), "OpenGiftNum"))
    set OpenGiftNum2 = S2I(DzAPI_Map_GetServerValue(Player(2), "OpenGiftNum"))
    set OpenGiftNum3 = S2I(DzAPI_Map_GetServerValue(Player(3), "OpenGiftNum"))

    set MidAutumnNewScore0 = 0
    set MidAutumnNewScore1 = 0
    set MidAutumnNewScore2 = 0
    set MidAutumnNewScore3 = 0

    set MidAutumnScore0 = S2I(DzAPI_Map_GetServerValue(Player(0), "MidAutumnScore"))
    set MidAutumnScore1 = S2I(DzAPI_Map_GetServerValue(Player(1), "MidAutumnScore"))
    set MidAutumnScore2 = S2I(DzAPI_Map_GetServerValue(Player(2), "MidAutumnScore"))
    set MidAutumnScore3 = S2I(DzAPI_Map_GetServerValue(Player(3), "MidAutumnScore"))

    set CScore0 = S2I(DzAPI_Map_GetServerValue(Player(0), "CScore"))
    set CScore1 = S2I(DzAPI_Map_GetServerValue(Player(1), "CScore"))
    set CScore2 = S2I(DzAPI_Map_GetServerValue(Player(2), "CScore"))
    set CScore3 = S2I(DzAPI_Map_GetServerValue(Player(3), "CScore"))

    set endless_old_one_0 = S2I(DzAPI_Map_GetServerValue(Player(0), Season_One_Key_Old))
    set endless_old_one_1 = S2I(DzAPI_Map_GetServerValue(Player(1), Season_One_Key_Old))
    set endless_old_one_2 = S2I(DzAPI_Map_GetServerValue(Player(2), Season_One_Key_Old))
    set endless_old_one_3 = S2I(DzAPI_Map_GetServerValue(Player(3), Season_One_Key_Old))

    set endless_old_team_0 = S2I(DzAPI_Map_GetServerValue(Player(0), Season_Team_Key_Old))
    set endless_old_team_1 = S2I(DzAPI_Map_GetServerValue(Player(1), Season_Team_Key_Old))
    set endless_old_team_2 = S2I(DzAPI_Map_GetServerValue(Player(2), Season_Team_Key_Old))
    set endless_old_team_3 = S2I(DzAPI_Map_GetServerValue(Player(3), Season_Team_Key_Old))

    set endless_one_0 = S2I(DzAPI_Map_GetServerValue(Player(0), Season_One_Key))
    set endless_one_1 = S2I(DzAPI_Map_GetServerValue(Player(1), Season_One_Key))
    set endless_one_2 = S2I(DzAPI_Map_GetServerValue(Player(2), Season_One_Key))
    set endless_one_3 = S2I(DzAPI_Map_GetServerValue(Player(3), Season_One_Key))

    set endless_one_New0 = 0
    set endless_one_New1 = 0
    set endless_one_New2 = 0
    set endless_one_New3 = 0

    set endless_team_0 = S2I(DzAPI_Map_GetServerValue(Player(0), Season_Team_Key))
    set endless_team_1 = S2I(DzAPI_Map_GetServerValue(Player(1), Season_Team_Key))
    set endless_team_2 = S2I(DzAPI_Map_GetServerValue(Player(2), Season_Team_Key))
    set endless_team_3 = S2I(DzAPI_Map_GetServerValue(Player(3), Season_Team_Key))

    set endless_team_New0 = 0
    set endless_team_New1 = 0
    set endless_team_New2 = 0
    set endless_team_New3 = 0

    set abyss_old_0 = S2I(DzAPI_Map_GetServerValue(Player(0), Season_Abyss_Key_Old))
    set abyss_old_1 = S2I(DzAPI_Map_GetServerValue(Player(1), Season_Abyss_Key_Old))
    set abyss_old_2 = S2I(DzAPI_Map_GetServerValue(Player(2), Season_Abyss_Key_Old))
    set abyss_old_3 = S2I(DzAPI_Map_GetServerValue(Player(3), Season_Abyss_Key_Old))

    set abyss0 = S2I(DzAPI_Map_GetServerValue(Player(0), Season_Abyss_Key))
    set abyss1 = S2I(DzAPI_Map_GetServerValue(Player(1), Season_Abyss_Key))
    set abyss2 = S2I(DzAPI_Map_GetServerValue(Player(2), Season_Abyss_Key))
    set abyss3 = S2I(DzAPI_Map_GetServerValue(Player(3), Season_Abyss_Key))

    set abyssNew0 = 0
    set abyssNew1 = 0
    set abyssNew2 = 0
    set abyssNew3 = 0
    

    set Model_List_0[0] = DzAPI_Map_GetServerValue( Player(0), "工人1")
    set Model_List_0[1] = DzAPI_Map_GetServerValue( Player(0), "工人2")
    set Model_List_0[2] = DzAPI_Map_GetServerValue( Player(0), "工人3")
    set Model_List_0[3] = DzAPI_Map_GetServerValue( Player(0), "斯温1")
    set Model_List_0[4] = DzAPI_Map_GetServerValue( Player(0), "斧王1")
    set Model_List_0[5] = DzAPI_Map_GetServerValue( Player(0), "工人4")
    set Model_List_0[6] = DzAPI_Map_GetServerValue( Player(0), "中秋光环")
    set Model_List_0[7] = DzAPI_Map_GetServerValue( Player(0), "工人5")
    set Model_List_0[8] = DzAPI_Map_GetServerValue( Player(0), "十一光环")
    set Model_List_0[9] = DzAPI_Map_GetServerValue( Player(0), "利爪熊将")
    set Model_List_0[10] = DzAPI_Map_GetServerValue( Player(0), "幻灵亡师")
    set Model_List_0[11] = DzAPI_Map_GetServerValue( Player(0), "克劳德")
    set Model_List_0[12] = DzAPI_Map_GetServerValue( Player(0), "桔梗")
    set Model_List_0[13] = DzAPI_Map_GetServerValue( Player(0), "赛季光环1")
    set Model_List_0[14] = DzAPI_Map_GetServerValue( Player(0), "深海暴徒")
    set Model_List_0[15] = DzAPI_Map_GetServerValue( Player(0), "恶灵骑士")
    set Model_List_0[16] = DzAPI_Map_GetServerValue( Player(0), "丛林之半神")
    set Model_List_0[17] = DzAPI_Map_GetServerValue( Player(0), "六芒星")
    set Model_List_0[18] = DzAPI_Map_GetServerValue( Player(0), "奴良陆生")
    set Model_List_0[19] = DzAPI_Map_GetServerValue( Player(0), "赛季光环2")
    set Model_List_0[20] = DzAPI_Map_GetServerValue( Player(0), "哥布林杀手")
    set Model_List_0[21] = DzAPI_Map_GetServerValue( Player(0), "无双魅影")
    set Model_List_0[22] = DzAPI_Map_GetServerValue( Player(0), "犬夜叉")
    set Model_List_0[23] = DzAPI_Map_GetServerValue( Player(0), "玛法里奥")
    set Model_List_0[24] = DzAPI_Map_GetServerValue( Player(0), "情报窃取者")
    set Model_List_0[25] = DzAPI_Map_GetServerValue( Player(0), "火焰领主")
    set Model_List_0[26] = DzAPI_Map_GetServerValue( Player(0), "赛季光环3")

    set Model_List_1[0] = DzAPI_Map_GetServerValue( Player(1), "工人1")
    set Model_List_1[1] = DzAPI_Map_GetServerValue( Player(1), "工人2")
    set Model_List_1[2] = DzAPI_Map_GetServerValue( Player(1), "工人3")
    set Model_List_1[3] = DzAPI_Map_GetServerValue( Player(1), "斯温1")
    set Model_List_1[4] = DzAPI_Map_GetServerValue( Player(1), "斧王1")
    set Model_List_1[5] = DzAPI_Map_GetServerValue( Player(1), "工人4")
    set Model_List_1[6] = DzAPI_Map_GetServerValue( Player(1), "中秋光环")
    set Model_List_1[7] = DzAPI_Map_GetServerValue( Player(1), "工人5")
    set Model_List_1[8] = DzAPI_Map_GetServerValue( Player(1), "十一光环")
    set Model_List_1[9] = DzAPI_Map_GetServerValue( Player(1), "利爪熊将")
    set Model_List_1[10] = DzAPI_Map_GetServerValue( Player(1), "幻灵亡师")
    set Model_List_1[11] = DzAPI_Map_GetServerValue( Player(1), "克劳德")
    set Model_List_1[12] = DzAPI_Map_GetServerValue( Player(1), "桔梗")
    set Model_List_1[13] = DzAPI_Map_GetServerValue( Player(1), "赛季光环1")
    set Model_List_1[14] = DzAPI_Map_GetServerValue( Player(1), "深海暴徒")
    set Model_List_1[15] = DzAPI_Map_GetServerValue( Player(1), "恶灵骑士")
    set Model_List_1[16] = DzAPI_Map_GetServerValue( Player(1), "丛林之半神")
    set Model_List_1[17] = DzAPI_Map_GetServerValue( Player(1), "六芒星")
    set Model_List_1[18] = DzAPI_Map_GetServerValue( Player(1), "奴良陆生")
    set Model_List_1[19] = DzAPI_Map_GetServerValue( Player(1), "赛季光环2")
    set Model_List_1[20] = DzAPI_Map_GetServerValue( Player(1), "哥布林杀手")
    set Model_List_1[21] = DzAPI_Map_GetServerValue( Player(1), "无双魅影")
    set Model_List_1[22] = DzAPI_Map_GetServerValue( Player(1), "犬夜叉")
    set Model_List_1[23] = DzAPI_Map_GetServerValue( Player(1), "玛法里奥")
    set Model_List_1[24] = DzAPI_Map_GetServerValue( Player(1), "情报窃取者")
    set Model_List_1[25] = DzAPI_Map_GetServerValue( Player(1), "火焰领主")
    set Model_List_1[26] = DzAPI_Map_GetServerValue( Player(1), "赛季光环3")


    set Model_List_2[0] = DzAPI_Map_GetServerValue( Player(2), "工人1")
    set Model_List_2[1] = DzAPI_Map_GetServerValue( Player(2), "工人2")
    set Model_List_2[2] = DzAPI_Map_GetServerValue( Player(2), "工人3")
    set Model_List_2[3] = DzAPI_Map_GetServerValue( Player(2), "斯温1")
    set Model_List_2[4] = DzAPI_Map_GetServerValue( Player(2), "斧王1")
    set Model_List_2[5] = DzAPI_Map_GetServerValue( Player(2), "工人4")
    set Model_List_2[6] = DzAPI_Map_GetServerValue( Player(2), "中秋光环")
    set Model_List_2[7] = DzAPI_Map_GetServerValue( Player(2), "工人5")
    set Model_List_2[8] = DzAPI_Map_GetServerValue( Player(2), "十一光环")
    set Model_List_2[9] = DzAPI_Map_GetServerValue( Player(2), "利爪熊将")
    set Model_List_2[10] = DzAPI_Map_GetServerValue( Player(2), "幻灵亡师")
    set Model_List_2[11] = DzAPI_Map_GetServerValue( Player(2), "克劳德")
    set Model_List_2[12] = DzAPI_Map_GetServerValue( Player(2), "桔梗")
    set Model_List_2[13] = DzAPI_Map_GetServerValue( Player(2), "赛季光环1")
    set Model_List_2[14] = DzAPI_Map_GetServerValue( Player(2), "深海暴徒")
    set Model_List_2[15] = DzAPI_Map_GetServerValue( Player(2), "恶灵骑士")
    set Model_List_2[16] = DzAPI_Map_GetServerValue( Player(2), "丛林之半神")
    set Model_List_2[17] = DzAPI_Map_GetServerValue( Player(2), "六芒星")
    set Model_List_2[18] = DzAPI_Map_GetServerValue( Player(2), "奴良陆生")
    set Model_List_2[19] = DzAPI_Map_GetServerValue( Player(2), "赛季光环2")
    set Model_List_2[20] = DzAPI_Map_GetServerValue( Player(2), "哥布林杀手")
    set Model_List_2[21] = DzAPI_Map_GetServerValue( Player(2), "无双魅影")
    set Model_List_2[22] = DzAPI_Map_GetServerValue( Player(2), "犬夜叉")
    set Model_List_2[23] = DzAPI_Map_GetServerValue( Player(2), "玛法里奥")
    set Model_List_2[24] = DzAPI_Map_GetServerValue( Player(2), "情报窃取者")
    set Model_List_2[25] = DzAPI_Map_GetServerValue( Player(2), "火焰领主")
    set Model_List_2[26] = DzAPI_Map_GetServerValue( Player(2), "赛季光环3")


    set Model_List_3[0] = DzAPI_Map_GetServerValue( Player(3), "工人1")
    set Model_List_3[1] = DzAPI_Map_GetServerValue( Player(3), "工人2")
    set Model_List_3[2] = DzAPI_Map_GetServerValue( Player(3), "工人3")
    set Model_List_3[3] = DzAPI_Map_GetServerValue( Player(3), "斯温1")
    set Model_List_3[4] = DzAPI_Map_GetServerValue( Player(3), "斧王1")
    set Model_List_3[5] = DzAPI_Map_GetServerValue( Player(3), "工人4")
    set Model_List_3[6] = DzAPI_Map_GetServerValue( Player(3), "中秋光环")
    set Model_List_3[7] = DzAPI_Map_GetServerValue( Player(3), "工人5")
    set Model_List_3[8] = DzAPI_Map_GetServerValue( Player(3), "十一光环")
    set Model_List_3[9] = DzAPI_Map_GetServerValue( Player(3), "利爪熊将")
    set Model_List_3[10] = DzAPI_Map_GetServerValue( Player(3), "幻灵亡师")
    set Model_List_3[11] = DzAPI_Map_GetServerValue( Player(3), "克劳德")
    set Model_List_3[12] = DzAPI_Map_GetServerValue( Player(3), "桔梗")
    set Model_List_3[13] = DzAPI_Map_GetServerValue( Player(3), "赛季光环1")
    set Model_List_3[14] = DzAPI_Map_GetServerValue( Player(3), "深海暴徒")
    set Model_List_3[15] = DzAPI_Map_GetServerValue( Player(3), "恶灵骑士")
    set Model_List_3[16] = DzAPI_Map_GetServerValue( Player(3), "丛林之半神")
    set Model_List_3[17] = DzAPI_Map_GetServerValue( Player(3), "六芒星")
    set Model_List_3[18] = DzAPI_Map_GetServerValue( Player(3), "奴良陆生")
    set Model_List_3[19] = DzAPI_Map_GetServerValue( Player(3), "赛季光环2")
    set Model_List_3[20] = DzAPI_Map_GetServerValue( Player(3), "哥布林杀手")
    set Model_List_3[21] = DzAPI_Map_GetServerValue( Player(3), "无双魅影")
    set Model_List_3[22] = DzAPI_Map_GetServerValue( Player(3), "犬夜叉")
    set Model_List_3[23] = DzAPI_Map_GetServerValue( Player(3), "玛法里奥")
    set Model_List_3[24] = DzAPI_Map_GetServerValue( Player(3), "情报窃取者")
    set Model_List_3[25] = DzAPI_Map_GetServerValue( Player(3), "火焰领主")
    set Model_List_3[26] = DzAPI_Map_GetServerValue( Player(3), "赛季光环3")


    set ScoreSkin_Player_0[0] = ""
    set ScoreSkin_Player_1[0] = ""
    set ScoreSkin_Player_2[0] = ""
    set ScoreSkin_Player_3[0] = ""
    set index = 0
    loop
        exitwhen 26 < index
        if(null != Model_List_0[index] and "" != Model_List_0[index] ) then
            set ScoreSkin_Player_0[0] = ScoreSkin_Player_0[0] + "," + I2S(index + 1)
        else
            call DoNothing()
        endif
        if(null != Model_List_1[index] and "" != Model_List_1[index] ) then
            set ScoreSkin_Player_1[0] = ScoreSkin_Player_1[0] + "," + I2S(index + 1)
        else
            call DoNothing()
        endif
        if(null != Model_List_2[index] and "" != Model_List_2[index] ) then
            set ScoreSkin_Player_2[0] = ScoreSkin_Player_2[0] + "," + I2S(index + 1)
        else
            call DoNothing()
        endif
        if(null != Model_List_3[index] and "" != Model_List_3[index] ) then
            set ScoreSkin_Player_3[0] = ScoreSkin_Player_3[0] + "," + I2S(index + 1)
        else
            call DoNothing()
        endif
        set index = index + 1
    endloop
    set index = 0
    loop
        exitwhen 4 < index
        if(0 < index) then
            set indexSTR = "ScoreSkin" + I2S(index)
            set ScoreSkin_Player_0[index] = ""
            set ScoreSkin_Player_1[index] = ""
            set ScoreSkin_Player_2[index] = ""
            set ScoreSkin_Player_3[index] = ""
        else
            set indexSTR = "ScoreSkin"
        endif
        set tempPlayerSkinStr = DzAPI_Map_GetServerValue( Player(0), indexSTR)
        if(null != tempPlayerSkinStr and "" != tempPlayerSkinStr ) then
            set ScoreSkin_Player_0[index] = tempPlayerSkinStr
        else
            call DoNothing()
        endif
        set tempPlayerSkinStr = DzAPI_Map_GetServerValue( Player(1), indexSTR)
        if(null != tempPlayerSkinStr and "" != tempPlayerSkinStr ) then
            set ScoreSkin_Player_1[index] = tempPlayerSkinStr
        else
            call DoNothing()
        endif
        set tempPlayerSkinStr = DzAPI_Map_GetServerValue( Player(2), indexSTR)
        if(null != tempPlayerSkinStr and "" != tempPlayerSkinStr ) then
            set ScoreSkin_Player_2[index] = tempPlayerSkinStr
        else
            call DoNothing()
        endif
        set tempPlayerSkinStr = DzAPI_Map_GetServerValue( Player(3), indexSTR)
        if(null != tempPlayerSkinStr and "" != tempPlayerSkinStr ) then
            set ScoreSkin_Player_3[index] = tempPlayerSkinStr
        else
            call DoNothing()
        endif
        set index = index + 1
    endloop


    set BAN_Player_Data_0 = DzAPI_Map_GetServerValue( Player(0), "BAN_HERO")
    set BAN_Player_Data_1 = DzAPI_Map_GetServerValue( Player(1), "BAN_HERO")
    set BAN_Player_Data_2 = DzAPI_Map_GetServerValue( Player(2), "BAN_HERO")
    set BAN_Player_Data_3 = DzAPI_Map_GetServerValue( Player(3), "BAN_HERO")

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function ShowRoomScore takes player whichPlayer,string Score,string CScore returns nothing
    call DzAPI_Map_Stat_SetStat( whichPlayer, "score", Score + "/" + CScore )
endfunction

function DZAPI_Update_Player0_CSORE takes nothing returns nothing
    if(0 == isSuccessLoad_0) then
        return
    else
        call DoNothing()
    endif
    if(0 < CScore0) then
        set CScore0 = 0
    elseif(-100 > CScore0) then
        set CScore0 = -100
    else
        call DoNothing()
    endif

    call DzAPI_Map_SaveServerValue( Player(0), "CScore", I2S(CScore0))
    call ShowRoomScore(Player(0), I2S(score0), I2S(CScore0 + 100))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Update_Player1_CSORE takes nothing returns nothing
    if(0 == isSuccessLoad_1) then
        return
    else
        call DoNothing()
    endif
    if(0 < CScore1) then
        set CScore1 = 0
    elseif(-100 > CScore1) then
        set CScore1 = -100
    else
        call DoNothing()
    endif
    call DzAPI_Map_SaveServerValue( Player(1), "CScore", I2S(CScore1))
    call ShowRoomScore(Player(1), I2S(score1), I2S(CScore1 + 100))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Update_Player2_CSORE takes nothing returns nothing
    if(0 == isSuccessLoad_2) then
        return
    else
        call DoNothing()
    endif
    if(0 < CScore2) then
        set CScore2 = 0
    elseif(-100 > CScore2) then
        set CScore2 = -100
    else
        call DoNothing()
    endif
    call DzAPI_Map_SaveServerValue( Player(2), "CScore", I2S(CScore2))
    call ShowRoomScore(Player(2), I2S(score2), I2S(CScore2 + 100))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Update_Player3_CSORE takes nothing returns nothing
    if(0 == isSuccessLoad_3) then
        return
    else
        call DoNothing()
    endif
    if(0 < CScore3) then
        set CScore3 = 0
    elseif(-100 > CScore3) then
        set CScore3 = -100
    else
        call DoNothing()
    endif
    call DzAPI_Map_SaveServerValue( Player(3), "CScore", I2S(CScore3))
    call ShowRoomScore(Player(3), I2S(score3), I2S(CScore3 + 100))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Player0_Buy_Model takes nothing returns nothing
    local string keyStr = ""
    if(0 == isSuccessLoad_0) then
        return
    else
        call DoNothing()
    endif
    if(0 == ScoreSkin_Index) then
        set keyStr = "ScoreSkin"
    else
        set keyStr = "ScoreSkin" + I2S(ScoreSkin_Index)
    endif
    call DzAPI_Map_SaveServerValue( Player(0), keyStr, ScoreSkin_Player_0[ScoreSkin_Index])

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Player1_Buy_Model takes nothing returns nothing
    local string keyStr = ""
    if(0 == isSuccessLoad_1) then
        return
    else
        call DoNothing()
    endif
    if(0 == ScoreSkin_Index) then
        set keyStr = "ScoreSkin"
    else
        set keyStr = "ScoreSkin" + I2S(ScoreSkin_Index)
    endif
    call DzAPI_Map_SaveServerValue( Player(1), keyStr, ScoreSkin_Player_1[ScoreSkin_Index])

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Player2_Buy_Model takes nothing returns nothing
    local string keyStr = ""
    if(0 == isSuccessLoad_2) then
        return
    else
        call DoNothing()
    endif
    if(0 == ScoreSkin_Index) then
        set keyStr = "ScoreSkin"
    else
        set keyStr = "ScoreSkin" + I2S(ScoreSkin_Index)
    endif
    call DzAPI_Map_SaveServerValue( Player(2), keyStr, ScoreSkin_Player_2[ScoreSkin_Index])

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Player3_Buy_Model takes nothing returns nothing
    local string keyStr = ""
    if(0 == isSuccessLoad_3) then
        return
    else
        call DoNothing()
    endif
    if(0 == ScoreSkin_Index) then
        set keyStr = "ScoreSkin"
    else
        set keyStr = "ScoreSkin" + I2S(ScoreSkin_Index)
    endif
    call DzAPI_Map_SaveServerValue( Player(3), keyStr, ScoreSkin_Player_3[ScoreSkin_Index])

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_Player0_Skin_Piece takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(0), "SkinPiece", I2S(SkinPiece0))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_Player1_Skin_Piece takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(1), "SkinPiece", I2S(SkinPiece1))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_Player2_Skin_Piece takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(2), "SkinPiece", I2S(SkinPiece2))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_Player3_Skin_Piece takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(3), "SkinPiece", I2S(SkinPiece3))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_DotaTDSprStr_0 takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(0), "DotaTDSprStr", DotaTDSprStr0)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_DotaTDSprStr_1 takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(1), "DotaTDSprStr", DotaTDSprStr1)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_DotaTDSprStr_2 takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(2), "DotaTDSprStr", DotaTDSprStr2)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_DotaTDSprStr_3 takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(3), "DotaTDSprStr", DotaTDSprStr3)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_DotaTDSumStr_0 takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(0), "DotaTDSumStr", DotaTDSumStr0)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_DotaTDSumStr_1 takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(1), "DotaTDSumStr", DotaTDSumStr1)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_DotaTDSumStr_2 takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(2), "DotaTDSumStr", DotaTDSumStr2)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_DotaTDSumStr_3 takes nothing returns nothing
    call DzAPI_Map_SaveServerValue( Player(3), "DotaTDSumStr", DotaTDSumStr3)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_OpenGiftNum_0 takes nothing returns nothing
    if(0 == isSuccessLoad_0) then
        return
    else
        call DoNothing()
    endif
    
    call DzAPI_Map_SaveServerValue( Player(0), "OpenGiftNum", I2S(OpenGiftNum0))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_OpenGiftNum_1 takes nothing returns nothing
    if(0 == isSuccessLoad_1) then
        return
    else
        call DoNothing()
    endif
    
    call DzAPI_Map_SaveServerValue( Player(1), "OpenGiftNum", I2S(OpenGiftNum1))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_OpenGiftNum_2 takes nothing returns nothing
    if(0 == isSuccessLoad_2) then
        return
    else
        call DoNothing()
    endif
    
    call DzAPI_Map_SaveServerValue( Player(2), "OpenGiftNum", I2S(OpenGiftNum2))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_OpenGiftNum_3 takes nothing returns nothing
    if(0 == isSuccessLoad_3) then
        return
    else
        call DoNothing()
    endif
    
    call DzAPI_Map_SaveServerValue( Player(3), "OpenGiftNum", I2S(OpenGiftNum3))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction


function DZAPI_Save_Act_Score_0 takes nothing returns nothing
    if(0 == isSuccessLoad_0) then
        return
    else
        call DoNothing()
    endif
    
    call DzAPI_Map_SaveServerValue( Player(0), "ActScore0", I2S(ActScore0))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Act_Score_1 takes nothing returns nothing
    if(0 == isSuccessLoad_1) then
        return
    else
        call DoNothing()
    endif
    
    call DzAPI_Map_SaveServerValue( Player(1), "ActScore0", I2S(ActScore1))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Act_Score_2 takes nothing returns nothing
    if(0 == isSuccessLoad_2) then
        return
    else
        call DoNothing()
    endif
    
    call DzAPI_Map_SaveServerValue( Player(2), "ActScore0", I2S(ActScore2))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Act_Score_3 takes nothing returns nothing
    if(0 == isSuccessLoad_3) then
        return
    else
        call DoNothing()
    endif
    
    call DzAPI_Map_SaveServerValue( Player(3), "ActScore0", I2S(ActScore3))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Abyss_Player_0 takes nothing returns nothing
    if(0 == isSuccessLoad_0) then
        return
    else
        call DoNothing()
    endif
    if(abyssNew0 > abyss0) then
        set abyss0 = abyssNew0
        call DzAPI_Map_SaveServerValue( Player(0), Season_Abyss_Key, I2S(abyss0))
        call DzAPI_Map_Stat_SetStat( Player(0), "abyss", I2S(abyss0) )
    else
        call DoNothing()
    endif
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function DZAPI_Save_Abyss_Player_1 takes nothing returns nothing
    if(0 == isSuccessLoad_1) then
        return
    else
        call DoNothing()
    endif
    if(abyssNew1 > abyss1) then
        set abyss1 = abyssNew1
        call DzAPI_Map_SaveServerValue( Player(1), Season_Abyss_Key, I2S(abyss1))
        call DzAPI_Map_Stat_SetStat( Player(1), "abyss", I2S(abyss1) )
    else
        call DoNothing()
    endif
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Abyss_Player_2 takes nothing returns nothing
    if(0 == isSuccessLoad_2) then
        return
    else
        call DoNothing()
    endif
    if(abyssNew2 > abyss2) then
        set abyss2 = abyssNew2
        call DzAPI_Map_SaveServerValue( Player(2), Season_Abyss_Key, I2S(abyss2))
        call DzAPI_Map_Stat_SetStat( Player(2), "abyss", I2S(abyss2) )
    else
        call DoNothing()
    endif
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Abyss_Player_3 takes nothing returns nothing
    if(0 == isSuccessLoad_3) then
        return
    else
        call DoNothing()
    endif
    if(abyssNew3 > abyss3) then
        set abyss3 = abyssNew3
        call DzAPI_Map_SaveServerValue( Player(3), Season_Abyss_Key, I2S(abyss3))
        call DzAPI_Map_Stat_SetStat( Player(3), "abyss", I2S(abyss3) )
    else
        call DoNothing()
    endif
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Ban_Data takes integer playerID returns nothing
    local string strData = ""
    local string strID = ""
    local integer heroCount = 3
    local integer index = 0
    local integer type_ban = TB_BAN_HERO_0 + playerID
    if GetLocalPlayer() != Player(playerID) then
        return
    endif
    if Has_VIP_Player[playerID] then
        set heroCount = 4
    endif
    loop
        exitwhen heroCount <= index
        set strID = LoadStr(HSTB, type_ban, index)
        if null != strID and "" != strID then
            if "" == strData then
                set strData = strID
            else
                set strData = strData + "," + strID
            endif
        endif
        set index = index + 1
    endloop
    call DzAPI_Map_SaveServerValue( Player(playerID), "BAN_HERO", strData)
endfunction

function DZAPI_Save_Player0_Data takes nothing returns nothing
    if(0 == isSuccessLoad_0) then
        return
    else
        call DoNothing()
    endif
    if(endless_one_New0 > endless_one_0) then
        set endless_one_0 = endless_one_New0
        call DzAPI_Map_SaveServerValue( Player(0), Season_One_Key, I2S(endless_one_0))
    else
        call DoNothing()
    endif
    if(endless_team_New0 > endless_team_0) then
        set endless_team_0 = endless_team_New0
        call DzAPI_Map_SaveServerValue( Player(0), Season_Team_Key, I2S(endless_team_0))
    else
        call DoNothing()
    endif
    call DzAPI_Map_Stat_SetStat( Player(0), "endless", I2S(endless_one_0) + "/" + I2S(endless_team_0) )
    call DzAPI_Map_SaveServerValue( Player(0), "score", I2S(score0 + scoreNew0))
    call ShowRoomScore(Player(0), I2S(score0 + scoreNew0), I2S(CScore0 + 100))
    call DzAPI_Map_SaveServerValue( Player(0), "MidAutumnScore", I2S(MidAutumnScore0 + MidAutumnNewScore0))
    call DZAPI_Save_Ban_Data(0)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Player1_Data takes nothing returns nothing
    if(0 == isSuccessLoad_1) then
        return
    else
        call DoNothing()
    endif
    if(endless_one_New1 > endless_one_1) then
        set endless_one_1 = endless_one_New1
        call DzAPI_Map_SaveServerValue( Player(1), Season_One_Key, I2S(endless_one_1))
    else
        call DoNothing()
    endif
    if(endless_team_New1 > endless_team_1) then
        set endless_team_1 = endless_team_New1
        call DzAPI_Map_SaveServerValue( Player(1), Season_Team_Key, I2S(endless_team_1))
    else
        call DoNothing()
    endif
    call DzAPI_Map_Stat_SetStat( Player(1), "endless", I2S(endless_one_1) + "/" + I2S(endless_team_1) )
    call DzAPI_Map_SaveServerValue( Player(1), "score", I2S(score1 + scoreNew1))
    call ShowRoomScore(Player(1), I2S(score1 + scoreNew1), I2S(CScore1 + 100))
    call DzAPI_Map_SaveServerValue( Player(1), "MidAutumnScore", I2S(MidAutumnScore1 + MidAutumnNewScore1))
    call DZAPI_Save_Ban_Data(1)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Player2_Data takes nothing returns nothing
    if(0 == isSuccessLoad_2) then
        return
    else
        call DoNothing()
    endif
    if(endless_one_New2 > endless_one_2) then
        set endless_one_2 = endless_one_New2
        call DzAPI_Map_SaveServerValue( Player(2), Season_One_Key, I2S(endless_one_2))
    else
        call DoNothing()
    endif
    if(endless_team_New2 > endless_team_2) then
        set endless_team_2 = endless_team_New2
        call DzAPI_Map_SaveServerValue( Player(2), Season_Team_Key, I2S(endless_team_2))
    else
        call DoNothing()
    endif
    call DzAPI_Map_Stat_SetStat( Player(2), "endless", I2S(endless_one_2) + "/" + I2S(endless_team_2) )
    call DzAPI_Map_SaveServerValue( Player(2), "score", I2S(score2 + scoreNew2))
    call ShowRoomScore(Player(2), I2S(score2 + scoreNew2), I2S(CScore2 + 100))
    call DzAPI_Map_SaveServerValue( Player(2), "MidAutumnScore", I2S(MidAutumnScore2 + MidAutumnNewScore2))
    call DZAPI_Save_Ban_Data(2)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Save_Player3_Data takes nothing returns nothing
    if(0 == isSuccessLoad_3) then
        return
    else
        call DoNothing()
    endif
    if(endless_one_New3 > endless_one_3) then
        set endless_one_3 = endless_one_New3
        call DzAPI_Map_SaveServerValue( Player(3), Season_One_Key, I2S(endless_one_3))
    else
        call DoNothing()
    endif
    if(endless_team_New3 > endless_team_3) then
        set endless_team_3 = endless_team_New3
        call DzAPI_Map_SaveServerValue( Player(3), Season_Team_Key, I2S(endless_team_3))
    else
        call DoNothing()
    endif
    call DzAPI_Map_Stat_SetStat( Player(3), "endless", I2S(endless_one_3) + "/" + I2S(endless_team_3) )
    call DzAPI_Map_SaveServerValue( Player(3), "score", I2S(score3 + scoreNew3))
    call ShowRoomScore(Player(3), I2S(score3 + scoreNew3), I2S(CScore3 + 100))
    call DzAPI_Map_SaveServerValue( Player(3), "MidAutumnScore", I2S(MidAutumnScore3 + MidAutumnNewScore3))
    call DZAPI_Save_Ban_Data(3)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

//积分更新
function DZAPI_Score_Cost_0 takes nothing returns nothing
    
    call DzAPI_Map_SaveServerValue( Player(0), "score", I2S(score0))
    call ShowRoomScore(Player(0), I2S(score0), I2S(CScore0 + 100))
    call DzAPI_Map_SaveServerValue( Player(0), "MidAutumnScore", I2S(MidAutumnScore0))
    set CScore0 = 0

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Score_Cost_1 takes nothing returns nothing
    
    call DzAPI_Map_SaveServerValue( Player(1), "score", I2S(score1))
    call ShowRoomScore(Player(1), I2S(score1), I2S(CScore1 + 100))
    call DzAPI_Map_SaveServerValue( Player(1), "MidAutumnScore", I2S(MidAutumnScore1))
    set CScore1 = 0

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Score_Cost_2 takes nothing returns nothing

    
    call DzAPI_Map_SaveServerValue( Player(2), "score", I2S(score2))
    call ShowRoomScore(Player(2), I2S(score2), I2S(CScore2 + 100))
    call DzAPI_Map_SaveServerValue( Player(2), "MidAutumnScore", I2S(MidAutumnScore2))
    set CScore2 = 0

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Score_Cost_3 takes nothing returns nothing
    
    call DzAPI_Map_SaveServerValue( Player(3), "score", I2S(score3))
    call ShowRoomScore(Player(3), I2S(score3), I2S(CScore3 + 100))
    call DzAPI_Map_SaveServerValue( Player(3), "MidAutumnScore", I2S(MidAutumnScore3))
    set CScore3 = 0

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function ResetAllScoreItem takes player whichPlayer returns nothing
    call DzAPI_Map_SaveServerValue( whichPlayer, "ScoreSkin", "")
    call DzAPI_Map_SaveServerValue( whichPlayer, "ScoreSkin1", "")
    call DzAPI_Map_SaveServerValue( whichPlayer, "ScoreSkin2", "")
    call DzAPI_Map_SaveServerValue( whichPlayer, "SkinPiece", "0")
    call DzAPI_Map_SaveServerValue( whichPlayer, "ActScore0", "0")
    call DzAPI_Map_SaveServerValue( whichPlayer, "DotaTDSprStr", "")
    call DzAPI_Map_SaveServerValue( whichPlayer, "DotaTDSumStr", "")
endfunction

function DZAPI_Score_Reset_0 takes nothing returns nothing
    
    set score0 = 0
    set MidAutumnScore0 = 0
    set endless_team_0 = 0
    set endless_one_0 = 0
    call ResetAllScoreItem(Player(0))
    call DzAPI_Map_SaveServerValue( Player(0), "score", I2S(score0))
    call DzAPI_Map_Stat_SetStat( Player(0), "score", I2S(score0) )
    call DzAPI_Map_SaveServerValue( Player(0), "endless_team_2", "0")
    call DzAPI_Map_SaveServerValue( Player(0), "endless_one_2", "0")
    call DzAPI_Map_Stat_SetStat( Player(0), "endless", "0/0" )
    call DzAPI_Map_SaveServerValue( Player(0), "MidAutumnScore", I2S(MidAutumnScore0))

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Score_Reset_1 takes nothing returns nothing
    
    set score1 = 0
    set MidAutumnScore1 = 0
    set endless_team_1 = 0
    set endless_one_1 = 0
    call ResetAllScoreItem(Player(1))
    call DzAPI_Map_SaveServerValue( Player(1), "score", I2S(score1))
    call DzAPI_Map_Stat_SetStat( Player(1), "score", I2S(score1) )
    call DzAPI_Map_SaveServerValue( Player(1), "endless_team_2", "0")
    call DzAPI_Map_SaveServerValue( Player(1), "endless_one_2", "0")
    call DzAPI_Map_Stat_SetStat( Player(1), "endless", "0/0" )
    call DzAPI_Map_SaveServerValue( Player(1), "MidAutumnScore", I2S(MidAutumnScore1))

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Score_Reset_2 takes nothing returns nothing
    
    set score2 = 0
    set MidAutumnScore2 = 0
    set endless_team_2 = 0
    set endless_one_2 = 0
    call ResetAllScoreItem(Player(2))
    call DzAPI_Map_SaveServerValue( Player(2), "score", I2S(score2))
    call DzAPI_Map_Stat_SetStat( Player(2), "score", I2S(score2) )
    call DzAPI_Map_SaveServerValue( Player(2), "endless_team_2", "0")
    call DzAPI_Map_SaveServerValue( Player(2), "endless_one_2", "0")
    call DzAPI_Map_Stat_SetStat( Player(2), "endless", "0/0" )
    call DzAPI_Map_SaveServerValue( Player(2), "MidAutumnScore", I2S(MidAutumnScore2))

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Score_Reset_3 takes nothing returns nothing
    
    set score3 = 0
    set MidAutumnScore3 = 0
    set endless_team_3 = 0
    set endless_one_3 = 0
    call ResetAllScoreItem(Player(3))
    call DzAPI_Map_SaveServerValue( Player(3), "score", I2S(score3))
    call DzAPI_Map_Stat_SetStat( Player(3), "score", I2S(score3) )
    call DzAPI_Map_SaveServerValue( Player(3), "endless_team_2", "0")
    call DzAPI_Map_SaveServerValue( Player(3), "endless_one_2", "0")
    call DzAPI_Map_Stat_SetStat( Player(3), "endless", "0/0" )
    call DzAPI_Map_SaveServerValue( Player(3), "MidAutumnScore", I2S(MidAutumnScore3))

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function Trig_Notice_Timer_Action takes nothing returns nothing
    local integer playerID = S2I(DzGetTriggerSyncData())
    local timer NoticeTimer = NoticeActions[playerID]
    if null == NoticeTimer then
        return
    endif
    call DestroyTimer(NoticeTimer)
    set NoticeActions[playerID] = null
endfunction

function Notice_Bg_Hide takes nothing returns nothing
    local integer playerID = 0
    local timer NoticeTimer = GetExpiredTimer()
    local integer frame = DzFrameFindByName("Notice_bg", 0)
    loop
        exitwhen 3 < playerID or NoticeTimer == NoticeActions[playerID]
        set playerID = playerID + 1
    endloop
    if playerID != GetPlayerId(GetLocalPlayer()) then
        return
    endif
    if 20 > DzFrameGetAlpha(frame) then
        call DzFrameSetAlpha(frame, 0)
        call DzFrameShow(frame, false)
        call DzSyncData("Notice_Timer", I2S(playerID))
    else
    endif
    call DzFrameSetAlpha(frame, DzFrameGetAlpha(frame) - 10)
endfunction

function Trig_NoticeActions takes nothing returns nothing
    local player trig_player = DzGetTriggerSyncPlayer()
    local integer playerID = GetPlayerId(trig_player)
    local string content = DzGetTriggerSyncData()
    local timer NoticeTimer = NoticeActions[playerID]
    local integer frame = 0
    local integer frame_text = 0
    if playerID == GetPlayerId(GetLocalPlayer()) then
        set frame = DzFrameFindByName("Notice_bg", 0)
        set frame_text = DzFrameFindByName("Notice_TEXT", 0)
        call DzFrameSetAlpha(frame, 255)
        call DzFrameShow(frame, true)
        call DzFrameSetText(frame_text, content)
        call DzFrameSetSize(frame, 0.0046 * StringLength(content), 0.034)
    else
    endif
    if null != NoticeTimer then
        call DestroyTimer(NoticeTimer)
    else
    endif
    set NoticeTimer = CreateTimer()
    set NoticeActions[playerID] = NoticeTimer
    call TimerStart(NoticeTimer, 0.1, true, function Notice_Bg_Hide)
endfunction

//---------------调用DZ自定义界面----右下角DPS排行---start---------
function Init_Rank_Damage_Hide takes nothing returns nothing
    local integer index = 0
    local integer ui = 0
    local boolean flag = false
    if DzGetTriggerUIEventPlayer() == GetLocalPlayer() then
        loop
            exitwhen 3 < index
            call DzFrameShow(Dmg_UI_Bg[index], flag)
            call DzFrameShow(Dmg_UI[index], flag)
            call DzFrameShow(Dmg_UI_Text_Desc[index], flag)
            call DzFrameShow(Dmg_UI_Text_Player[index], flag)
            set index = index + 1
        endloop
        call DzFrameShow(Btn_UI_Open, true)
        call DzFrameShow(Btn_UI_Close, flag)
        set ui = DzFrameGetTooltip()
        call DzFrameClearAllPoints(ui)
        call DzFrameSetPoint(ui, 6, DzFrameGetCommandBarButton(2, 3), 0, -0.22, 0.11)
        call DzFrameSetSize(ui, 0.10, 0.03)
    else
        call DoNothing()
    endif
endfunction

function Init_Rank_Damage_Show takes nothing returns nothing
    local integer index = 0
    local integer ui = 0
    local boolean flag = true
    if DzGetTriggerUIEventPlayer() == GetLocalPlayer() then
        loop
            exitwhen 3 < index
            call DzFrameShow(Dmg_UI_Bg[index], flag)
            call DzFrameShow(Dmg_UI[index], flag)
            call DzFrameShow(Dmg_UI_Text_Desc[index], flag)
            call DzFrameShow(Dmg_UI_Text_Player[index], flag)
            set index = index + 1
        endloop
        call DzFrameShow(Btn_UI_Open, false)
        call DzFrameShow(Btn_UI_Close, flag)
        set ui = DzFrameGetTooltip()
        call DzFrameClearAllPoints(ui)
        call DzFrameSetPoint(ui, 6, DzFrameGetCommandBarButton(2, 3), 0, -0.3, 0.11)
        call DzFrameSetSize(ui, 0.10, 0.03)
    else
        call DoNothing()
    endif
endfunction

function Init_Rank_Damage_Show_Trig takes nothing returns nothing
    call ConditionalTriggerExecute(Rank_Damage_Show_Trig)
endfunction

function Init_Rank_Damage_Hide_Trig takes nothing returns nothing
    call ConditionalTriggerExecute(Rank_Damage_Hide_Trig)
endfunction

function Init_Choose_Frame takes nothing returns nothing
    set Frame_ChooseHero = DzCreateFrame("Choose_Hero_3", DzGetGameUI(), 0)
    call DzFrameSetPoint(Frame_ChooseHero, 4, DzGetGameUI(), 4, 0, 0.05)
    set Hero_Tip = DzCreateFrame("Choose_TIPBG", DzGetGameUI(), 0)
    set Hero_Tip_Text = DzCreateFrame("Choose_TipTextArea", Hero_Tip, 0)
    call DzFrameShow(Hero_Tip, false)
    call DzFrameShow(Frame_ChooseHero, false)
endfunction

function Init_Rank_Damage takes nothing returns nothing
    local integer index = 0
    local integer ui = 0
    loop
        exitwhen 3 < index

        set Dmg_UI_Bg[index] = DzCreateFrameByTagName("BACKDROP","Frame_Image_Bg_" + I2S(index), DzGetGameUI(), "ImageTemplate", 0)
        call DzFrameSetTexture(Dmg_UI_Bg[index],"UI\\Damage_Dark.blp",0)
        call DzFrameClearAllPoints(Dmg_UI_Bg[index])
        call DzFrameSetPoint(Dmg_UI_Bg[index], 2, DzGetGameUI(), 5, -0.001, -0.004 - index * 0.035)
        call DzFrameSetSize(Dmg_UI_Bg[index], 0.15, 0.014)
        call DzFrameShow(Dmg_UI_Bg[index], true)

        set Dmg_UI[index]=DzCreateFrameByTagName("BACKDROP","Frame_Image" + I2S(index), DzGetGameUI(), "ImageTemplate", 0)
        call DzFrameSetTexture(Dmg_UI[index],"UI\\Damage_Red.blp",0)
        call DzFrameClearAllPoints(Dmg_UI[index])
        call DzFrameSetPoint(Dmg_UI[index], 2, DzGetGameUI(), 5, -0.001, -0.004 - index * 0.035)
        call DzFrameSetSize(Dmg_UI[index], 0.00, 0.015)
        call DzFrameShow(Dmg_UI[index], true)

        set Dmg_UI_Text_Desc[index] = DzCreateFrameByTagName("TEXT","Frame_Text_Desc" + I2S(index), DzGetGameUI(), "Text10LDef", 0)
        call DzFrameClearAllPoints(Dmg_UI_Text_Desc[index])
        call DzFrameSetPoint(Dmg_UI_Text_Desc[index], 2, DzGetGameUI(), 5, 0, -0.004 - index * 0.035)
        call DzFrameShow(Dmg_UI_Text_Desc[index], true)
        call DzFrameSetText(Dmg_UI_Text_Desc[index], "【待定】")
        call DzFrameSetTextColor(Dmg_UI_Text_Desc[index], 0xFFFFFF)

        set Dmg_UI_Text_Player[index] = DzCreateFrameByTagName("TEXT","Frame_Text_Player" + I2S(index), DzGetGameUI(), "Text10LDef", 0)
        call DzFrameClearAllPoints(Dmg_UI_Text_Player[index])
        call DzFrameSetPoint(Dmg_UI_Text_Player[index], 2, DzGetGameUI(), 5, 0, 0.01 - index * 0.035)
        call DzFrameShow(Dmg_UI_Text_Player[index], true)
        call DzFrameSetText(Dmg_UI_Text_Player[index], "")
        call DzFrameSetTextColor(Dmg_UI_Text_Player[index], 0xFFFFFF)

        //DzDestroyFrame(Dmg_UI[index])

        set Dmg_UI_Count[index] = 0
        set Dmg_Desc[index] = ""
        set Dmg_Player[index] = ""

        set index = index + 1
        
    endloop

    call DzLoadToc("ui\\custom.toc")
    set Btn_UI_Open = DzCreateFrame("Frame_Btn_Open",DzGetGameUI(),0)
    call DzFrameSetPoint(Btn_UI_Open, 2, DzGetGameUI(), 5, -0.026, -0.125)
    call DzFrameSetSize(Btn_UI_Open, 0.018, 0.018)
    call DzFrameShow(Btn_UI_Open, false)

    set Btn_UI_Close = DzCreateFrame("Frame_Btn_Close",DzGetGameUI(),1)
    call DzFrameSetPoint(Btn_UI_Close, 2, DzGetGameUI(), 5, -0.026, -0.125)
    call DzFrameSetSize(Btn_UI_Close, 0.018, 0.018)
    call DzFrameShow(Btn_UI_Close, true)

    set Rank_Damage_Show_Trig = CreateTrigger()
    call TriggerAddAction(Rank_Damage_Show_Trig,function Init_Rank_Damage_Show)
    set Rank_Damage_Hide_Trig = CreateTrigger()
    call TriggerAddAction(Rank_Damage_Hide_Trig,function Init_Rank_Damage_Hide)

    call DzFrameSetScriptByCode(Btn_UI_Open,1,function Init_Rank_Damage_Show_Trig,true)
    call DzFrameSetScriptByCode(Btn_UI_Close,1,function Init_Rank_Damage_Hide_Trig,true)

    set ui = DzFrameGetTooltip()
    call DzFrameClearAllPoints(ui)
    call DzFrameSetPoint(ui, 6, DzFrameGetCommandBarButton(2, 3), 0, -0.3, 0.11)
    call DzFrameSetSize(ui, 0.10, 0.03)


    set ui = DzFrameGetHeroBarButton(1)
    call DzFrameClearAllPoints(ui)
    call DzFrameSetPoint(ui, 3, DzFrameGetHeroBarButton(0), 3, 0.05, 0)

    set ui = DzFrameGetHeroBarButton(2)
    call DzFrameClearAllPoints(ui)
    call DzFrameSetPoint(ui, 3, DzFrameGetHeroBarButton(1), 3, 0.05, 0)

    set ui = DzFrameGetHeroBarButton(3)
    call DzFrameClearAllPoints(ui)
    call DzFrameSetPoint(ui, 3, DzFrameGetHeroBarButton(2), 3, 0.05, 0)

    set ui = DzFrameGetHeroBarButton(4)
    call DzFrameClearAllPoints(ui)
    call DzFrameSetPoint(ui, 3, DzFrameGetHeroBarButton(3), 3, 0.05, 0)

    call Init_Choose_Frame()

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function Init_Rank_Damage_Update takes nothing returns nothing
    local real Max_Width = 0.05
    local integer index = 0
    local real Damage_Sum = 0
    local real UI_X = 0
    loop
        exitwhen null == Dmg_UI_Count[index]
        set Damage_Sum = Damage_Sum + Dmg_UI_Count[index]
        set index = index + 1
    endloop   
    
    set index = 0
    loop
        exitwhen 3 < index
        if(null == Dmg_UI_Count[index] or 0 == Dmg_UI_Count[index] or null == Dmg_Desc[index] or "" == Dmg_Desc[index] or null == Dmg_Player[index] or "" == Dmg_Player[index] or 0 == Damage_Sum) then
            set UI_X = 0.00001
            call DzFrameSetText(Dmg_UI_Text_Desc[index], "【待定】")
            call DzFrameSetText(Dmg_UI_Text_Player[index], "")
            call DzFrameSetTextColor(Dmg_UI_Text_Desc[index], 0xFFFFFF)
            call DzFrameSetTextColor(Dmg_UI_Text_Player[index], 0xFFFFFF)
            call DzFrameSetPoint(Dmg_UI_Text_Desc[index], 2, DzGetGameUI(), 5, 0, -0.004 - index * 0.035)
        else
            set UI_X = Dmg_UI_Count[index] / Damage_Sum * Max_Width
            call DzFrameSetText(Dmg_UI_Text_Desc[index], Dmg_Desc[index])
            call DzFrameSetText(Dmg_UI_Text_Player[index], Dmg_Player[index])
            call DzFrameSetPoint(Dmg_UI_Text_Desc[index], 2, DzGetGameUI(), 5, -0.001 - UI_X, -0.004 - index * 0.035)
        endif
        if(0.00001 > UI_X) then
            set UI_X = 0.00001
        elseif(Max_Width < UI_X) then
            set UI_X = Max_Width
        endif
        call DzFrameSetSize(Dmg_UI[index], UI_X, 0.015)
        set index = index + 1
    endloop
    //call DisplayTextToPlayer(Player(0), 0, 0, "总输出：" + I2S(Damage_Sum))
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function DZAPI_Rank_Damage_Destory takes nothing returns nothing
    local integer index = 0
    loop
        exitwhen 3 < index
        call DzDestroyFrame(Dmg_UI_Bg[index])
        call DzDestroyFrame(Dmg_UI[index])
        call DzDestroyFrame(Dmg_UI_Text_Desc[index])
        call DzDestroyFrame(Dmg_UI_Text_Player[index])
        set index = index + 1
    endloop
    call DzDestroyFrame(Btn_UI_Open)
    call DzDestroyFrame(Btn_UI_Close)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

//---------------图鉴选择英雄概率的自定义UI----start-
    //call DisplayTextToPlayer(Player(0), 0, 0, "总输出：")

function Show_TuJian takes nothing returns nothing
    if(5 > DzAPI_Map_GetMapLevel(DzGetTriggerUIEventPlayer()) and true == IfAstrict_LV )then
        call DisplayTextToPlayer(DzGetTriggerUIEventPlayer(), 0, 0, "|cffffcc00地图等级大于5级开放该功能！|r")
        return
    else
    endif
    if DzGetTriggerUIEventPlayer() != GetLocalPlayer() then
        return
    else
    endif
    if Frame_Bg_flag then
        set Frame_Bg_flag = false
    else
        set Frame_Bg_flag = true
    endif
    call DzFrameShow(udg_TuJian_Bg, Frame_Bg_flag)
endfunction
function GetMoneyByWeight takes integer weight returns integer
    if 100 > weight then
        return 0
    else
    endif
    return 500 + (weight - 100) * 11
endfunction
//获取提升的概率
function GetProbabilityByWeight takes integer weight returns real
    local real i = 0
    if 100 > weight then
        return 0
    else
    endif
    set i = I2R((weight - 100)*100)/I2R(weight + 4200)
    return i
endfunction

function Weight_UI_Choose_Update takes nothing returns nothing
    local player updatePlayer = Player(Weight_Update_Player)
    if updatePlayer != GetLocalPlayer() or Choose_Item_ID[GetPlayerId(updatePlayer)] != Weight_Update_ItemID then
        return
    else
    endif
    call DzFrameSetText(DzFrameFindByName("hero_probability", 0), "概率提升：0%")
    call DzFrameSetText(DzFrameFindByName("hero_weight", 0), "当前权重：100")
    call DzFrameSetText(DzFrameFindByName("hero_weight_money", 0), "本次购买金币：" + I2S(GetMoneyByWeight(100)))
endfunction

function GetModuloInteger takes integer dividend, integer divisor returns integer 
    return dividend - (dividend / divisor) * divisor 
endfunction 

function Eff_Show takes integer eff_type returns nothing
    local string effName = ""
    if 1 == eff_type then
        set effName = "BUY_WEIGHT_X3.MDX"
    else    
        set effName = "BUY_WEIGHT_X2.MDX"
    endif

    //call DisplayTextToPlayer(Player(0), 0, 0, "|cFFF00000ID:|r" + I2S(Btn_Eff))
    //call DzFrameClearAllPoints(Btn_Eff)
    call DzFrameSetModel(Btn_Eff, effName, 0, 0)
    call DzFrameSetSize(Btn_Eff,.00001,.00001)
    call DzFrameSetAnimate(Btn_Eff, 0, true)
    call DzFrameSetAnimateOffset(Btn_Eff, 0.00)
    call DzFrameShow(Btn_Eff, true)
endfunction

function Has_Ban_Hero_ID takes integer playerID, integer itemID returns boolean
    local integer type_ban = TB_BAN_HERO_0 + playerID
    local string strID = ""
    local integer index = 0
    loop
        exitwhen 3 < index
        set strID = LoadStr(HSTB, type_ban, index)
        if strID == I2S(itemID) then
            return true
        endif
        set index = index + 1
    endloop 
    return false
endfunction

function Ban_BtnTipsOn takes nothing returns nothing
    local string tip = "将该英雄加入|cff5CACEE小黑屋|r，|cff5CACEE小黑屋|r中的英雄下一局开始将不会出现在开局|cffEE7621特质橙色卡片（开局选卡）的选择中|r。"
    if DzGetTriggerUIEventPlayer() == GetLocalPlayer() then
        call DzFrameClearAllPoints(Tip_Bg)
        call DzFrameSetPoint(Tip_Bg, 0, DzGetTriggerUIEventFrame(), 2, 0.0, 0.0)
        call DzFrameSetText(Tip_Text, tip)
        call DzFrameSetSize(Tip_Text, 0.1, 0.09)
        call DzFrameSetSize(Tip_Bg, 0.118, 0.075)
        call DzFrameShow(Tip_Bg, true)
    endif
endfunction

function Ban_Panel_TipsOn takes nothing returns nothing
    local string tip = "|cff5CACEE小黑屋|r中的英雄将不会出现在开局|cffEE7621特质橙色卡片（开局选卡）的选择中|r，您可以自由加入或者移除里面的英雄。加入方法：选中英雄后，点击英雄头像右侧的“关”图标即可。|n|cFFF00000注：需要等到游戏正常结束或者通关最终BOSS才保存小黑屋数据，中途秒退不保存！|r|n|cffEE7621[拥有赞助特权的玩家小黑屋位置+1]|r"
    if DzGetTriggerUIEventPlayer() == GetLocalPlayer() then
        call DzFrameClearAllPoints(Tip_Bg)
        call DzFrameSetPoint(Tip_Bg, 2, DzGetTriggerUIEventFrame(), 0, 0.0, 0.0)
        call DzFrameSetText(Tip_Text, tip)
        call DzFrameSetSize(Tip_Text, 0.14, 0.12)
        call DzFrameSetSize(Tip_Bg, 0.155, 0.13)
        call DzFrameShow(Tip_Bg, true)
    endif
endfunction

function BtnTipsOn takes nothing returns nothing
    local integer id
    local string tip
    if DzGetTriggerUIEventPlayer() == GetLocalPlayer() then
        set id=(LoadInteger(HSTB, TB_Ability_Tips, DzGetTriggerUIEventFrame())) // INLINED!!
        if id != 0 then
            set tip = Get_Ability_Data(id, "Name")
            call DzFrameClearAllPoints(Tip_Bg)
            call DzFrameSetPoint(Tip_Bg, 0, DzGetTriggerUIEventFrame(), 2, 0.0, 0.0)
            call DzFrameSetText(Tip_Text, tip)
            call DzFrameSetSize(Tip_Text, 0.18, 0.2)
            call DzFrameSetSize(Tip_Bg, 0.2, 0.13)
            //call DzFrameSetSize(Tip_Bg, 0.2, -DzFrameGetHeight(Tip_Text))
            call DzFrameShow(Tip_Bg, true)
        endif
    endif
endfunction
function BtnTipsOff takes nothing returns nothing
    call DzFrameShow(Tip_Bg, false)
endfunction

function Trig_ChooseItemActions takes nothing returns nothing
    local integer index = 0
    local integer skillCount = 1
    local integer choose_item = 0
    local integer choose_item_bg = 0
    local integer hero_desc = 0
    local integer hero_name = 0
    local integer hero_probability = 0
    local integer hero_weight = 0
    local integer hero_come_soon = 0
    local integer hero_come_soon_desc = 0
    local integer hero_weight_desc = 0
    local integer hero_weight_money = 0
    local integer player_type = 0
    local integer weight_count = 0
    local integer unitID = 0
    local integer icon_skill = 0
    local string charString = ""
    local string abilityID = ""
    local string realID = ""
    local boolean isShow_Ban = false
    local integer itemID = S2I(DzGetTriggerSyncData())
    local player triPlayer = DzGetTriggerSyncPlayer()
    set Choose_Item_ID[GetPlayerId(triPlayer)] = itemID
    if triPlayer != GetLocalPlayer() then
        return
    else
    endif
    if Has_Ban_Hero_ID(GetPlayerId(triPlayer), itemID) then
        set isShow_Ban = false
    else
        set isShow_Ban = true
    endif
    if(Player(0) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_0
    elseif(Player(1) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_1
    elseif(Player(2) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_2
    elseif(Player(3) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_3
    else
    endif
    set choose_item_bg = DzFrameFindByName("hero_choose_bg", 0)
    set choose_item = DzFrameFindByName("hero_choose_icon", 0)
    set hero_name = DzFrameFindByName("hero_name", 0)
    set hero_desc = DzFrameFindByName("hero_desc", 0)
    set hero_probability = DzFrameFindByName("hero_probability", 0)
    set hero_weight = DzFrameFindByName("hero_weight", 0)
    set hero_weight_desc = DzFrameFindByName("hero_weight_desc", 0)
    set hero_weight_money = DzFrameFindByName("hero_weight_money", 0)
    set hero_come_soon = DzFrameFindByName("hero_come_soon", 0)
    set hero_come_soon_desc = DzFrameFindByName("hero_come_soon_desc", 0)
    set weight_count = LoadInteger(HSTB, player_type, itemID)
    call DzFrameShow(hero_come_soon, false)
    call DzFrameShow(hero_come_soon_desc, false)
    if 13 < S2I(Get_Item_Data(itemID, "Level")) then
        call DzFrameSetTexture(choose_item_bg, "UI\\ItemBg_SSR.blp", 0)
        call DzFrameShow(DzFrameFindByName("btn_buy", 0), false) 
        call DzFrameSetText(hero_weight, "")
        call DzFrameSetText(hero_weight_money, "")
        call DzFrameShow(DzFrameFindByName("hero_weight_SSR_desc", 0), true)
        call DzFrameShow(hero_weight_desc, false)
        set isShow_Ban = false
    else
        call DzFrameSetTexture(choose_item_bg, "UI\\ItemBg_SR.blp", 0)
        call DzFrameShow(DzFrameFindByName("hero_weight_SSR_desc", 0), false)
        call DzFrameShow(DzFrameFindByName("btn_buy", 0), true)
        call DzFrameShow(hero_weight_desc, true)
        call DzFrameSetText(hero_probability, "概率提升：" + R2SW(GetProbabilityByWeight(weight_count),1,2) + "%")
        call DzFrameSetText(hero_weight, "当前权重：" + I2S(weight_count))
        call DzFrameSetText(hero_weight_money, "本次购买金币：" + I2S(GetMoneyByWeight(weight_count)))
    endif
    if (100 > weight_count) then
        call DzFrameShow(DzFrameFindByName("btn_buy", 0), false) 
        call DzFrameSetText(hero_weight, "")
        call DzFrameSetText(hero_probability, "")
        call DzFrameSetText(hero_weight_money, "")
        call DzFrameShow(DzFrameFindByName("hero_weight_SSR_desc", 0), false)
        call DzFrameShow(hero_weight_desc, false)
        if(-1 == weight_count) then
            call DzFrameShow(hero_come_soon_desc, true)
            call DzFrameSetText(hero_come_soon_desc, "彩蛋英雄塔，非抽卡方式获得！")
            set isShow_Ban = false
        else
            call DzFrameShow(hero_come_soon, true)
            call DzFrameShow(hero_come_soon_desc, true)
            call DzFrameSetText(hero_come_soon_desc, "以上技能描述可能会与英雄出来后有出入，最后请以正式版为准")
        endif
    else
    endif
    call DzFrameSetTexture(choose_item, Get_Item_Data(itemID, "Art"), 0)
    call DzFrameSetText(hero_name, Get_Item_Data(itemID, "Name"))
    call DzFrameSetText(hero_desc, Get_Item_Data(itemID, "Ubertip"))
    call DzFrameShow(DzFrameFindByName("btn_ban", 0), isShow_Ban)
    set unitID = S2ID(SubString(Get_Ability_Data(S2ID(Get_Item_Data(itemID, "abilList")), "UnitID1"), 0, 4))
    //call DisplayTextToPlayer(Player(0), 0, 0, Get_Ability_Data(S2ID(Get_Item_Data(itemID, "abilList")), "UnitID1"))
    //return
    set abilityID = Get_Unit_Data(unitID, "heroAbilList")
    loop
        set charString = SubString(abilityID, index, index + 1)
        //exitwhen "" == charString
        if "," == charString or "" == charString then
            if "A" == SubString(realID, 0, 1) then
                set icon_skill = DzFrameFindByName("icon_skill_img_" + I2S(skillCount), 0)
                call DzFrameSetTexture(icon_skill, Get_Ability_Data(S2ID(realID), "Art"), 0)
                //call DzFrameSetTooltip(icon_skill, DzFrameGetTooltip())
                call SaveInteger(HSTB, TB_Ability_Tips, DzFrameFindByName("icon_skill_" + I2S(skillCount), 0), S2ID(realID)) // INLINED!!
                set skillCount = skillCount + 1
            else
            endif
            set realID = ""
            if "" == charString then
                return
            else
            endif
        else
            set realID = realID + charString
        endif
        set index = index + 1
    endloop
endfunction

function Trig_BuyWeightActions takes nothing returns nothing
    local integer weight = 0
    local real probability = 0
    local integer player_type = 0
    local integer hero_probability = 0
    local integer hero_weight = 0
    local integer hero_weight_money = 0
    local integer need_money = 0
    local integer add_weight_count = 1
    local integer randomInt = 0
    local integer playerID = 0
    local player triPlayer = DzGetTriggerSyncPlayer()
    if(Player(0) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_0
    elseif(Player(1) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_1
    elseif(Player(2) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_2
    elseif(Player(3) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_3
    else
    endif
    set playerID = GetPlayerId(triPlayer)
    set hero_probability = DzFrameFindByName("hero_probability", 0)
    set hero_weight = DzFrameFindByName("hero_weight", 0)
    set hero_weight_money = DzFrameFindByName("hero_weight_money", 0)
    set weight = LoadInteger(HSTB, player_type, Choose_Item_ID[playerID])
    set need_money = GetMoneyByWeight(weight)
    if(GetPlayerState(triPlayer, PLAYER_STATE_RESOURCE_GOLD) < need_money) then
        //call DisplayTextToPlayer(triPlayer, 0, 0, "|cFFF00000金币不足，无法购买！|r")
        if triPlayer == GetLocalPlayer() then
            call DzSyncData("Notice", "|cFFF00000金币不足，无法购买！|r")
        endif
        return
    else
    endif
    call SetPlayerState( triPlayer, PLAYER_STATE_RESOURCE_GOLD, GetPlayerState(triPlayer, PLAYER_STATE_RESOURCE_GOLD) - need_money )
    set randomInt = GetRandomInt(1, 100)
    //set randomInt = 100
    if 2 > randomInt then
        set add_weight_count = 3
    elseif 25 > randomInt then
        set add_weight_count = 2
    else
    endif
    set weight = weight + R2I(I2R(weight) * add_weight_count * 0.15)
    set probability = GetProbabilityByWeight(weight)
    set need_money = GetMoneyByWeight(weight)
    call SaveInteger(HSTB, player_type, Choose_Item_ID[playerID], weight)
    if triPlayer == GetLocalPlayer() then
        if 2 > randomInt then
            call Eff_Show(1)
        elseif 30 > randomInt then
            call Eff_Show(0)
        else
        endif
       //call DzFrameSetText(hero_probability, "概率提升：" + R2SW(GetProbabilityByWeight(weight),1,2) + "%")
        call DzFrameSetText(hero_probability, "概率提升：" + R2SW(probability,1,2) + "%" + "|cff66CD00(+" +  R2SW((GetProbabilityByWeight(weight + R2I(I2R(weight) * 0.15)) - probability),1,2) + "%)|r")
        call DzFrameSetText(hero_weight, "当前权重：" + I2S(weight) + "|cff66CD00(+" + I2S(R2I(I2R(weight) * 0.15)) + ")|r")
        call DzFrameSetText(hero_weight_money, "本次购买金币：" + I2S(need_money))
    else
    endif
    set Buy_Weight_Player = triPlayer
    set Buy_Weight_ItemID = Choose_Item_ID[playerID]
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 302 )
endfunction

function Buy_Btn_Click takes nothing returns nothing
    local player triPlayer = DzGetTriggerUIEventPlayer()
    if 0 == Choose_Item_ID[GetPlayerId(triPlayer)] or triPlayer != GetLocalPlayer() then
        return
    else
    endif
    call DzSyncData("BuyWeight", "11")
endfunction

function Buy_Btn_Move takes nothing returns nothing
    local integer hero_probability = 0
    local integer hero_weight = 0
    local integer player_type = 0
    local integer weight = 0
    local real probability = 0
    local player triPlayer = DzGetTriggerUIEventPlayer()
    if triPlayer != GetLocalPlayer() or 0 == DzGetTriggerUIEventFrame() or 0 == Choose_Item_ID[GetPlayerId(triPlayer)] then
        return
    else
    endif
    if(Player(0) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_0
    elseif(Player(1) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_1
    elseif(Player(2) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_2
    elseif(Player(3) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_3
    else
    endif
    set weight = LoadInteger(HSTB, player_type, Choose_Item_ID[GetPlayerId(triPlayer)])
    set probability = GetProbabilityByWeight(weight)
    set hero_probability = DzFrameFindByName("hero_probability", 0)
    set hero_weight = DzFrameFindByName("hero_weight", 0)
    call DzFrameSetText(hero_probability, "概率提升：" + R2SW(probability,1,2) + "%" + "|cff66CD00(+" +  R2SW((GetProbabilityByWeight(weight + R2I(I2R(weight) * 0.15)) - probability),1,2) + "%)|r")
    call DzFrameSetText(hero_weight, "当前权重：" + I2S(weight) + "|cff66CD00(+" + I2S(R2I(I2R(weight) * 0.15)) + ")|r") 
endfunction

function Buy_Btn_Leave takes nothing returns nothing
    local integer hero_probability = 0
    local integer hero_weight = 0
    local integer player_type = 0
    local integer weight = 0
    local player triPlayer = DzGetTriggerUIEventPlayer()
    if triPlayer != GetLocalPlayer() or 0 == DzGetTriggerUIEventFrame() or 0 == Choose_Item_ID[GetPlayerId(triPlayer)] then
        return
    else
    endif
    if(Player(0) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_0
    elseif(Player(1) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_1
    elseif(Player(2) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_2
    elseif(Player(3) == triPlayer) then
        set player_type = TB_TYPE_HERO_WEIGHT_3
    else
    endif
    set weight = LoadInteger(HSTB, player_type, Choose_Item_ID[GetPlayerId(triPlayer)])
    set hero_probability = DzFrameFindByName("hero_probability", 0)
    set hero_weight = DzFrameFindByName("hero_weight", 0)
    call DzFrameSetText(hero_probability, "概率提升：" + R2SW(GetProbabilityByWeight(weight),1,2) + "%")
    call DzFrameSetText(hero_weight, "当前权重：" + I2S(weight) + "") 
endfunction


function Item_Btn_Click takes nothing returns nothing
    local integer itemID = 0
    local integer itemUI = DzGetTriggerUIEventFrame()
    local player triPlayer = DzGetTriggerUIEventPlayer()
    if triPlayer != GetLocalPlayer() or 0 == itemUI then
        return
    else
    endif
    set itemID = LoadInteger(HSTB, TB_ITEM_ID, itemUI)
    //set Choose_Item_ID[GetPlayerId(triPlayer)] = itemID
    call DzSyncData("ChooseItem", I2S(itemID))
endfunction

function Ban_Item_Update takes integer index returns nothing
    local integer playerID = GetPlayerId(GetLocalPlayer())
    local integer type_ban = TB_BAN_HERO_0 + playerID
    local string strID = LoadStr(HSTB, type_ban, index)
    local integer frame = 0
    local integer frame_bg = 0
    set frame = DzFrameFindByName("BAN_UI_Item_icon", index)
    if 0 != frame then
        call DzFrameSetTexture(frame, "UI\\ItemBg.blp",0)
    else
    endif
    if null != strID and "" != strID then
        //call DisplayTextToPlayer(Player(0), 0, 0, strID)
        set frame_bg = DzFrameFindByName("BAN_UI_BG_Item", index)
        call DzFrameSetTexture(frame,Get_Item_Data(S2I(strID), "Art"),0)
        call DzFrameSetPoint(frame, 4, frame_bg, 4, 0, 0)
        call DzFrameShow(DzFrameFindByName("Btn_BAN_Back", index), true)
    else
    endif
endfunction

function Item_Ban_Click takes nothing returns nothing
    local integer playerID = GetPlayerId(GetLocalPlayer())
    local integer itemUI = DzGetTriggerUIEventFrame()
    local integer type_ban = TB_BAN_HERO_0 + playerID
    local string strID = ""
    local integer index = 0
    local integer count = 2
    local boolean flag = false
    if 0 == itemUI then
        return
    else
    endif
    if Has_VIP_Player[playerID] then
        set count = 3
    else
    endif
    loop
        exitwhen count < index
        set strID = LoadStr(HSTB, type_ban, index)
        if null == strID or "" == strID then
            call SaveStr(HSTB, type_ban, index, I2S(Choose_Item_ID[playerID]))
            //call DisplayTextToPlayer(Player(0), 0, 0, I2S(Choose_Item_ID[playerID]))
            set flag = true
        else
        endif
        exitwhen flag
        set index = index + 1
    endloop
    if flag then
        call Ban_Item_Update(index)
        call DzFrameShow(DzFrameFindByName("btn_ban", 0), false)
    else
        //已满
        call DzSyncData("Notice", "|cFFF00000小黑屋成员已经满了，请腾出小黑屋空间再操作。|r")
    endif
    call DzClickFrame(DzFrameFindByName("Btn_Show_BAN", 0))
endfunction

function Set_Item_Icon takes integer itemID, integer Item_frame, integer index returns nothing
    local integer item_cell = 0
    local integer item_cell_bg = 0
    local integer item_cell_icon = 0
    local integer item_cell_name = 0
    local real item_x = 0.06
    local real item_y = 0.12
    local real item_x_count = 0.05
    local real item_y_count = 0.05
    local string item_bg_name = ""
    if (13 < S2I(Get_Item_Data(itemID, "Level"))) then
        set item_bg_name = "item_bg_SSR"
    else
        set item_bg_name = "item_bg_SR"
    endif
    set item_cell_bg = DzCreateFrame(item_bg_name, Item_frame, itemID)
    set item_cell = DzCreateFrame("item_btn", item_cell_bg, itemID)
    set item_cell_icon = DzFrameFindByName("item_icon", itemID)
    call DzFrameSetTexture(item_cell_icon, Get_Item_Data(itemID, "Art"), 0)
    call DzFrameSetPoint(item_cell, 4, item_cell_bg, 4, 0, 0.00)
    call DzFrameSetPoint(item_cell_bg, 4, Item_frame, 3, item_x + item_x_count * GetModuloInteger(index - 1, 5), item_y - item_y_count * R2I((index - 1) / 5))
    call SaveInteger(HSTB, TB_ITEM_ID, item_cell, itemID)
    call DzFrameSetScript(item_cell, 1, "Item_Btn_Click", false)
endfunction

function Type_Btn_Click takes nothing returns nothing
    local integer btn = 0
    if DzGetTriggerUIEventPlayer() != GetLocalPlayer() or 0 == DzGetTriggerUIEventFrame() then
        return
    else
    endif
    //call DisplayTextToPlayer(DzGetTriggerUIEventPlayer(), 0, 0, "点击了按钮")
    call DzFrameShow(DzFrameFindByName("ItemCell_STR", 0), false)
    call DzFrameShow(DzFrameFindByName("ItemCell_AGI", 0), false)
    call DzFrameShow(DzFrameFindByName("ItemCell_INT", 0), false)

    call DzFrameShow(DzFrameFindByName("str_btn", 0), true)
    call DzFrameShow(DzFrameFindByName("agi_btn", 0), true)
    call DzFrameShow(DzFrameFindByName("int_btn", 0), true)

    call DzFrameShow(DzFrameFindByName("str_btn_choose", 0), false)
    call DzFrameShow(DzFrameFindByName("agi_btn_choose", 0), false)
    call DzFrameShow(DzFrameFindByName("int_btn_choose", 0), false)
    set btn = DzGetTriggerUIEventFrame()
    //切页
    if(DzFrameFindByName("str_btn", 0) == btn) then
        call DzFrameShow(DzFrameFindByName("ItemCell_STR", 0), true)
        call DzFrameShow(DzFrameFindByName("str_btn_choose", 0), true)
        call DzFrameShow(DzFrameFindByName("str_btn", 0), false)
    elseif(DzFrameFindByName("agi_btn", 0) == btn) then
        call DzFrameShow(DzFrameFindByName("ItemCell_AGI", 0), true)
        call DzFrameShow(DzFrameFindByName("agi_btn_choose", 0), true)
        call DzFrameShow(DzFrameFindByName("agi_btn", 0), false)
    elseif(DzFrameFindByName("int_btn", 0) == btn) then
        call DzFrameShow(DzFrameFindByName("ItemCell_INT", 0), true)
        call DzFrameShow(DzFrameFindByName("int_btn_choose", 0), true)
        call DzFrameShow(DzFrameFindByName("int_btn", 0), false)
    else
    endif

endfunction

function HeroTipsOn takes nothing returns nothing
    local integer itemUI = DzGetTriggerUIEventFrame()
    local integer itemID = LoadInteger(HSTB, TB_HERO_ID, itemUI)
    if DzGetTriggerUIEventPlayer() != GetLocalPlayer() then
        return
    else
    endif
    call DzFrameClearAllPoints(Hero_Tip)
    call DzFrameSetPoint(Hero_Tip, 0, DzGetTriggerUIEventFrame(), 2, 0.0, -0.012)
    call DzFrameSetText(Hero_Tip_Text, Get_Item_Data(itemID, "Ubertip"))
    call DzFrameSetPoint(Hero_Tip_Text, 0, Hero_Tip, 0, 0.01, 0)
    call DzFrameShow(Hero_Tip, true)
    // call DisplayTextToPlayer(Player(0), 0, 0, Get_Item_Data(itemID, "Name"))
endfunction

function HeroTipsOff takes nothing returns nothing
    call DzFrameShow(Hero_Tip, false)
endfunction

function Hero_Btn_Click takes nothing returns nothing
    local integer itemID = 0
    local integer itemUI = DzGetTriggerUIEventFrame()
    local player triPlayer = DzGetTriggerUIEventPlayer()
    if triPlayer != GetLocalPlayer() or 0 == itemUI then
        return
    else
    endif
    call DzFrameShow(Frame_ChooseHero, false)
    call DzFrameShow(Hero_Tip, false)
    // call DisplayTextToPlayer(Player(0), 0, 0, "I2S(playerID)")
    set itemID = LoadInteger(HSTB, TB_HERO_ID, itemUI)
    call DzSyncData("ChooseHeroEnd", I2S(itemID))
endfunction

function Show_Choose_Hero takes  integer Player_ID returns nothing
    local integer index = 1
    local integer itemID = 0
    local integer item_cell = 0
    local integer item_cell_bg = 0
    local integer hero_tip_name = 0
    local integer item_cell_icon = 0
    local real item_x = 0.04
    local real item_x_count = 0.07
    local integer playerID = GetPlayerId(GetLocalPlayer())
    local integer player_type = 0
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
    if Player_ID != playerID then
        return
    else
    endif
    if 0 == playerID then
        set player_type = Wait_Choose_Hero_0
    elseif 1 == playerID then
        set player_type = Wait_Choose_Hero_1
    elseif 2 == playerID then
        set player_type = Wait_Choose_Hero_2
    else
        set player_type = Wait_Choose_Hero_3
    endif
    loop
        set itemID = LoadInteger(HSTB, player_type, index)
        exitwhen null == itemID or 0 == itemID
        set index = index + 1
    endloop
    if 4 < index then
        call DzFrameSetSize(Frame_ChooseHero, 0.291, 0.16)
    endif
    call DzFrameShow(Frame_ChooseHero, true)
    set index = 1
    loop
        set itemID = LoadInteger(HSTB, player_type, index)
        exitwhen null == itemID or 0 == itemID
        set item_cell_bg = DzCreateFrame("hero_btn", Frame_ChooseHero, itemID)
        // call DisplayTextToPlayer(Player(0), 0, 0, I2S(item_cell_bg))
        set item_cell = DzCreateFrame("choose_bg", Frame_ChooseHero, itemID)
        set hero_tip_name = DzCreateFrame("Choose_Hero_Name", Frame_ChooseHero, itemID)
        call DzFrameSetTexture(item_cell, Get_Item_Data(itemID, "Art"), 0)
        call DzFrameSetPoint(item_cell, 4, item_cell_bg, 4, 0, 0.006)
        call DzFrameSetPoint(item_cell_bg, 4, Frame_ChooseHero, 3, item_x + item_x_count * GetModuloInteger(index - 1, 5), 0)

        call DzFrameSetText(hero_tip_name, Get_Item_Data(itemID, "Name"))
        call DzFrameSetPoint(hero_tip_name, 4, item_cell_bg, 4, 0, -0.03)

        call DzFrameSetScript(item_cell_bg, 1, "Hero_Btn_Click", false)
        call DzFrameSetScript(item_cell_bg, 2, "HeroTipsOn", false)
        call DzFrameSetScript(item_cell_bg, 3, "HeroTipsOff", false)
        call SaveInteger(HSTB, TB_HERO_ID, item_cell_bg, itemID)  
        call SaveInteger(HSTB, player_type, index, 0) 
        set index = index + 1
    endloop
endfunction

function Trig_ChooseHeroAction takes nothing returns nothing
    set Choose_Hero_Player = DzGetTriggerSyncPlayer()
    set Choose_Hero_ItemID = S2I(DzGetTriggerSyncData())
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 305 )

    if Choose_Hero_Player != GetLocalPlayer()then
        return
    else
    endif
    call DzDestroyFrame(Frame_ChooseHero)
    call DzDestroyFrame(Hero_Tip)
endfunction

function Show_Choose_Hero_0 takes nothing returns nothing
    call Show_Choose_Hero(0)
endfunction

function Show_Choose_Hero_1 takes nothing returns nothing
    call Show_Choose_Hero(1)
endfunction

function Show_Choose_Hero_2 takes nothing returns nothing
    call Show_Choose_Hero(2)
endfunction

function Show_Choose_Hero_3 takes nothing returns nothing
    call Show_Choose_Hero(3)
endfunction

function Change_Ban_Hero_Data takes integer playerID returns nothing
    local integer type_ban = 0
    local integer index = 0
    local integer heroCount = 3
    local integer heroIcon = 0
    local string strID = ""
    local integer frame = 0
    local integer frame_bg = 0
    if GetLocalPlayer() != Player(playerID) then
        return
    else
    endif
    loop
        exitwhen 3 < index
        set frame = DzFrameFindByName("BAN_UI_Item_icon", index)
        if 0 != frame then
            call DzFrameSetTexture(frame, "UI\\ItemBg.blp",0)
        else
        endif
        set index = index + 1
    endloop
    if Has_VIP_Player[playerID] then
        set heroCount = 4
    else
        call DzFrameSetTexture(frame, "UI\\Ban_Item_Bg_Vip.blp",0)
    endif
    set index = 0
    set type_ban = TB_BAN_HERO_0 + playerID
    loop
        set strID = LoadStr(HSTB, type_ban, index)
        exitwhen heroCount <= index
        if null != strID and "" != strID then
            //call DisplayTextToPlayer(Player(0), 0, 0, "strID:" + strID)
            set frame_bg = DzFrameFindByName("BAN_UI_BG_Item", index)
            set frame = DzFrameFindByName("BAN_UI_Item_icon", index)
            call DzFrameSetTexture(frame,Get_Item_Data(S2I(strID), "Art"),0)
            call DzFrameShow(DzFrameFindByName("Btn_BAN_Back", index), true)
        else
        endif
        set index = index + 1
    endloop
endfunction

function Ban_Back_Btn_Click takes nothing returns nothing
    local integer index = 0
    local integer frame = 0
    local string strID = ""
    local integer playerID = GetPlayerId(GetLocalPlayer())
    local integer type_ban = TB_BAN_HERO_0 + playerID
    local integer itemUI = DzGetTriggerUIEventFrame()
    if 0 == itemUI then
        return
    else
    endif
    call DzFrameShow(itemUI, false)
    set index = 0
    loop
        if 3 < index then
            return
        else
        endif
        set frame = DzFrameFindByName("Btn_BAN_Back", index)
        exitwhen itemUI == frame
        set index = index + 1
    endloop
    set strID = LoadStr(HSTB, type_ban, index)
    call SaveStr(HSTB, type_ban, index, "")
    call Ban_Item_Update(index)
    if strID == I2S(Choose_Item_ID[playerID]) then
        call DzFrameShow(DzFrameFindByName("btn_ban", 0), true)
    endif
endfunction

function Init_BAN_Frame takes nothing returns nothing
    local integer frame = 0
    local integer frame_icon = 0
    local integer frame_btn = 0
    local integer frame_bg = DzFrameFindByName("BAN_UI_BG", 0)
    local integer playerID = 0
    local integer index = 0
    local integer heroCount = 3
    set BAN_Hero_Y[0] = -0.045
    set BAN_Hero_Y[1] = -0.105
    set BAN_Hero_Y[2] = -0.165
    set BAN_Hero_Y[3] = -0.225
    loop
        exitwhen 3 < playerID
        set heroCount = 4
        set index = 0
        if GetLocalPlayer() == Player(playerID) then
            loop
                exitwhen heroCount <= index
                set frame = DzCreateFrame("BAN_UI_BG_Item", frame_bg, index)
                call DzFrameSetPoint(frame, 4, frame_bg, 1, -0.002, BAN_Hero_Y[index])

                set frame_icon = DzCreateFrame("BAN_UI_Item_icon", frame, index)
                call DzFrameSetPoint(frame_icon, 4, frame, 4, 0, 0)

                set frame_btn = DzCreateFrame("Btn_BAN_Back", frame_bg, index)
                call DzFrameSetPoint(frame_btn, 1, frame, 7, 0, -0.002)
                call DzFrameSetScript(frame_btn, 1, "Ban_Back_Btn_Click", false)
                call DzFrameShow(frame_btn, false)

                set index = index + 1
            endloop
            call Change_Ban_Hero_Data(playerID)
        else
        endif
        set playerID = playerID + 1
    endloop
endfunction

function Ban_Panel_Show takes nothing returns nothing
    call DzFrameShow(DzFrameFindByName("BAN_UI_BG", 0), true)
    call DzFrameShow(DzFrameFindByName("Btn_Show_BAN", 0), false)
endfunction

function Ban_Panel_Hide takes nothing returns nothing
    call DzFrameShow(DzFrameFindByName("BAN_UI_BG", 0), false)
    call DzFrameShow(DzFrameFindByName("Btn_Show_BAN", 0), true)
endfunction


//-----------------------任务面板-----------------------

function Trig_Reward_Task_Get takes nothing returns nothing
    local player trig_player = DzGetTriggerSyncPlayer()
    set Task_Reward_ItemID = S2I(DzGetTriggerSyncData())
    set Task_Reward_PlayerID = GetPlayerId(trig_player)
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 402 )
endfunction

function Reward_Click takes nothing returns nothing
    local integer frame = DzGetTriggerUIEventFrame()
    local integer playerID = GetPlayerId(DzGetTriggerUIEventPlayer()) 
    local integer index = 0
    local integer state = 0
    loop
        exitwhen 4 < index
        exitwhen frame == DzFrameFindByName("Btn_reward", index)
        set index = index + 1
    endloop
    set state = LoadInteger(HSTB, playerID + TB_REWARD_ITEM_0, index + 10)
    //还未显示
    if 0 == state then
        call DzSyncData("Notice", "|cFFF00000还未到达指定波数，无法领取。|r")
    //显示但是暂不可领取
    elseif 1 == state then
        call DzSyncData("Notice", "|cFFF00000还未到达指定波数，无法领取。|r")
    //可领取
    elseif 2 == state then
        call DzSyncData("Notice", "|c000EEE00领取成功！|r")
        call DzFrameSetText(DzFrameFindByName("reward_txt", index), "|cffffcc00已领取|r")
        call DzFrameShow(DzFrameFindByName("reward_got", index), true)
        call SaveInteger(HSTB, playerID + TB_REWARD_ITEM_0, index + 10, 3)
        call DzFrameShow(DzFrameFindByName("reward_eff", index), false)
        call DzSyncData("Reward_Task", I2S(LoadInteger(HSTB, playerID + TB_REWARD_ITEM_0, index)))
    //已领取
    elseif 3 == state then
        call DzSyncData("Notice", "|cFFF00000该奖励已经被领取。|r")
    //未知情况
    else
        call DzSyncData("Notice", "|cFFF00000未知错误！|r")
    endif
endfunction
function Reward_Show_Item takes nothing returns nothing
    local integer frame = 0
    local integer index = LoadInteger(HSTB, TB_REWARD_SHOW, 0)
    if 1 == LoadInteger(HSTB, TB_REWARD_ITEM_0 + GetPlayerId(GetLocalPlayer()) , 10 + index) then
        set frame = DzFrameFindByName("reward_bg", index)
        call DzFrameSetAlpha(frame, 255)
    endif
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function Reward_Can_Get_Item takes nothing returns nothing
    local integer frame = 0
    local integer index = LoadInteger(HSTB, TB_REWARD_GET, 0)
    if 2 == LoadInteger(HSTB, TB_REWARD_ITEM_0 + GetPlayerId(GetLocalPlayer()) , 10 + index) then
        set frame = DzFrameFindByName("reward_eff", index)
        call DzFrameShow(frame, true)
        set frame = DzFrameFindByName("Task_Btn_eff", 0)
        call DzFrameShow(frame, true)
        set frame = DzFrameFindByName("reward_txt", index)
        call DzFrameSetText(frame, "|c000EEE00点击领取|r")
    endif
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction
function Reward_Move takes nothing returns nothing
    local integer id = 0
    local integer index = 0
    local string tip
    local real width = 0
    local real height = 0
    local integer Trigframe = DzGetTriggerUIEventFrame()
    local integer frame
    local player Trig_PlayerInit = GetLocalPlayer()
    local integer reward_type = 0
    if Player(0) == Trig_PlayerInit then
        set reward_type = TB_REWARD_ITEM_0
    elseif Player(1) == Trig_PlayerInit then
        set reward_type = TB_REWARD_ITEM_1
    elseif Player(2) == Trig_PlayerInit then
        set reward_type = TB_REWARD_ITEM_2
    elseif Player(3) == Trig_PlayerInit then
        set reward_type = TB_REWARD_ITEM_3
    endif
    loop
        exitwhen 4 < index
        set frame = DzFrameFindByName("Btn_reward", index)
        exitwhen Trigframe == frame
        set index = index + 1
    endloop
    set frame = DzFrameFindByName("reward_bg", index)
    if 0 != DzFrameGetAlpha(frame) then
        set id = LoadInteger(HSTB, reward_type, index)
    endif
    if id != 0 then
        set tip = Get_Item_Data(id, "Name") + "|n|n" + Get_Item_Data(id, "Ubertip")
        set width = 0.18
        set height = 0.18
    else
        set tip = "达到指定波数可获得神秘奖励！"
        set width = 0.15
        set height = 0.04
    endif
    call DzFrameClearAllPoints(Tip_Bg)
    call DzFrameSetPoint(Tip_Bg, 0, Trigframe, 2, 0.0, 0.0)
    call DzFrameSetText(Tip_Text, tip)
    call DzFrameSetSize(Tip_Text, width - 0.02, height)
    call DzFrameSetSize(Tip_Bg, width, height)
    //call DzFrameSetSize(Tip_Bg, 0.2, -DzFrameGetHeight(Tip_Text))
    call DzFrameShow(Tip_Bg, true)
endfunction

function Trig_Init_Frame_Task takes nothing returns nothing
    local integer index = 0
    local integer frame_bg = DzFrameFindByName("Task_Bg", 0)
    local integer frame_txt
    local integer frame_Btn
    local integer frame_icon
    local integer reward_got
    local integer frame_eff
    local integer id
    local integer playerID = GetPlayerId(GetLocalPlayer()) 
    local string content
    local string art
    loop
        exitwhen 4 < index

        set frame_Btn = DzCreateFrame("Btn_reward", frame_bg, index)
        call DzFrameSetPoint(frame_Btn, 1, frame_bg, 1, 0, -0.013 - 0.062 * index)

        set frame_txt = DzCreateFrame("reward_txt", frame_bg, index)
        call DzFrameSetPoint(frame_txt, 1, frame_Btn, 7, 0, -0.003)

        set frame_icon = DzCreateFrame("reward_bg", frame_bg, index)
        call DzFrameSetPoint(frame_icon, 4, frame_Btn, 4, 0, 0)

        set reward_got = DzCreateFrame("reward_got", frame_bg, index)
        call DzFrameSetPoint(reward_got, 4, frame_Btn, 4, 0, 0)
        call DzFrameShow(reward_got, false)
        set id = LoadInteger(HSTB, playerID + TB_REWARD_ITEM_0, index)
        set art = Get_Item_Data(id, "Art")
        if null == art then
            call DisplayTextToPlayer(GetLocalPlayer(), 0, 0, "任务数据拉取失败！")
        else
            call DzFrameSetTexture(frame_icon, art, 0)
        endif

        set frame_eff = DzCreateFrame("reward_eff", frame_bg, index)
        call DzFrameSetPoint(frame_eff, 4, frame_icon, 4, 0, 0)
        call DzFrameSetModel(frame_eff, "UI_Reward_Eff.MDX", 0, 0)
        call DzFrameSetSize(frame_eff,.00001,.00001)
        call DzFrameSetAnimate(frame_eff, 0, true)
        call DzFrameSetAnimateOffset(frame_eff, 0.00)
        call DzFrameShow(frame_eff, false)
        
        set content = "|cffffcc00第" + I2S(5 + 10 * index ) + "波领取|r"
        
        call DzFrameSetText(frame_txt, content)
        call DzFrameSetScript(frame_Btn, 1, "Reward_Click", false)
        call DzFrameSetScript(frame_Btn, 2, "Reward_Move", false)
        call DzFrameSetScript(frame_Btn, 3, "BtnTipsOff", false)
        call DzFrameSetAlpha(frame_icon, 0)
        set index = index + 1
    endloop
    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

function Task_Bg_Hide takes nothing returns nothing
    local integer frame = DzFrameFindByName("Task_Bg", 0)
    call DzFrameShow(frame, false)
    set frame = DzFrameFindByName("Task_Btn_eff", 0)
    call DzFrameShow(frame, false)
endfunction

function Task_Bg_Show takes nothing returns nothing
    local integer frame = DzFrameFindByName("Task_Bg", 0)
    call DzFrameShow(frame, true)
    set frame = DzFrameFindByName("Task_Btn_eff", 0)
    call DzFrameShow(frame, false)
endfunction

function Trig_Init_Frame_TuJian takes nothing returns nothing
    local integer index = 1
    local integer Item_frame = 0
    local integer Notice_bg = 0
    local integer itemID = 0
    local integer frame = 0
    
    set Btn_TuJian_Open = DzCreateFrame("TuJianButton_Open", DzGetGameUI(), 0)
    call DzFrameSetPoint(Btn_TuJian_Open, 4, DzGetGameUI(), 4, -0.17, -0.15)
    call DzFrameShow(Btn_TuJian_Open, true) 
    
    call DzFrameSetScriptByCode(Btn_TuJian_Open,1,function Show_TuJian,false)

    set Btn_Show_Task = DzCreateFrame("Btn_Show_Task", DzGetGameUI(), 0)
    call DzFrameSetPoint(Btn_Show_Task, 3, DzGetGameUI(), 3, 0, 0.075)
    call DzFrameShow(Btn_Show_Task, true)
    call DzFrameSetScript(Btn_Show_Task, 1, "Task_Bg_Show", false)

    set frame = DzCreateFrame("Task_Btn_eff", DzGetGameUI(), 0)
    call DzFrameSetPoint(frame, 4, Btn_Show_Task, 4, 0, 0)
    call DzFrameSetModel(frame, "UI_Reward_Btn.MDX", 0, 0)
    call DzFrameSetSize(frame,.00001,.00001)
    call DzFrameSetAnimate(frame, 0, true)
    call DzFrameSetAnimateOffset(frame, 0.00)
    call DzFrameShow(frame, false)

    set frame = DzCreateFrame("Task_Bg", DzGetGameUI(), 0)
    call DzFrameSetPoint(frame, 3, DzGetGameUI(), 3, 0, 0.04)
    call DzFrameShow(frame, false)
    call DzFrameSetScript(DzFrameFindByName("Btn_reward_Hide", 0), 1, "Task_Bg_Hide", false)
    
    //call DzFrameSetText(DzFrameFindByName("AA33", 0), "|cff00ffff权 重|r")

    set udg_TuJian_Bg = DzCreateFrame("Frame_BeiJing", DzGetGameUI(), 0)
    call DzFrameSetPoint(udg_TuJian_Bg, 4, DzGetGameUI(), 4, 0, 0.03)
    call DzFrameShow(udg_TuJian_Bg, false)

    set Notice_bg = DzCreateFrame("Notice_bg", DzGetGameUI(), 0)
    call DzFrameSetPoint(Notice_bg, 4, DzGetGameUI(), 4, 0, -0.1)
    call DzFrameShow(Notice_bg, false)
    
    loop
        set itemID = LoadInteger(HSTB, TB_TYPE_HERO_STR, index)
        //call DisplayTextToPlayer(Player(0), 0, 0, Get_Item_Data(itemID, "Level"))
        exitwhen null == itemID or 0 == itemID
        set Item_frame = DzFrameFindByName("ItemCell_STR", 0)
        call Set_Item_Icon(itemID, Item_frame, index)
        set index = index + 1
    endloop
    set index = 1
    loop
        set itemID = LoadInteger(HSTB, TB_TYPE_HERO_AGI, index)
        //call DisplayTextToPlayer(Player(0), 0, 0, Get_Item_Data(itemID, "Level"))
        exitwhen null == itemID or 0 == itemID
        set Item_frame = DzFrameFindByName("ItemCell_AGI", 0)
        call Set_Item_Icon(itemID, Item_frame, index)
        set index = index + 1
    endloop
    set index = 1
    loop
        set itemID = LoadInteger(HSTB, TB_TYPE_HERO_INT, index)
        //call DisplayTextToPlayer(Player(0), 0, 0, Get_Item_Data(itemID, "Level"))
        exitwhen null == itemID or 0 == itemID
        set Item_frame = DzFrameFindByName("ItemCell_INT", 0)
        call Set_Item_Icon(itemID, Item_frame, index)
        set index = index + 1
    endloop
    
    //call DzFrameSetScriptByCode(DzFrameFindByName("str_btn", 0),1,function Type_Btn_Click,true)
    //call DzFrameSetScriptByCode(DzFrameFindByName("agi_btn", 0),1,function Type_Btn_Click,true)
    //call DzFrameSetScriptByCode(DzFrameFindByName("int_btn", 0),1,function Type_Btn_Click,true)

    set trig=CreateTrigger()
    call DzTriggerRegisterSyncData(trig, "BuyWeight", false)
    call TriggerAddAction(trig, function Trig_BuyWeightActions)

    set trig=CreateTrigger()
    call DzTriggerRegisterSyncData(trig, "ChooseItem", false)
    call TriggerAddAction(trig, function Trig_ChooseItemActions)

    set trig=CreateTrigger()
    call DzTriggerRegisterSyncData(trig, "Notice", false)
    call TriggerAddAction(trig, function Trig_NoticeActions)

    set trig=CreateTrigger()
    call DzTriggerRegisterSyncData(trig, "Notice_Timer", false)
    call TriggerAddAction(trig, function Trig_Notice_Timer_Action)

    set trig=CreateTrigger()
    call DzTriggerRegisterSyncData(trig, "Reward_Task", false)
    call TriggerAddAction(trig, function Trig_Reward_Task_Get)

    call DzFrameSetScript(DzFrameFindByName("str_btn", 0), 1, "Type_Btn_Click", false)
    call DzFrameSetScript(DzFrameFindByName("agi_btn", 0), 1, "Type_Btn_Click", false)
    call DzFrameSetScript(DzFrameFindByName("int_btn", 0), 1, "Type_Btn_Click", false)
    call DzFrameSetScript(DzFrameFindByName("btn_buy", 0), 1, "Buy_Btn_Click", false)
    call DzFrameSetScript(DzFrameFindByName("btn_buy", 0), 2, "Buy_Btn_Move", false)
    call DzFrameSetScript(DzFrameFindByName("btn_buy", 0), 3, "Buy_Btn_Leave", false)
    call DzFrameSetScript(DzFrameFindByName("btn_close_Frame", 0), 1, "Show_TuJian", false)
    //call DzFrameSetScriptByCode(DzFrameFindByName("btn_close_Frame", 0), 1, Show_TuJian, true)
    
    call DzFrameShow(DzFrameFindByName("btn_buy", 0), false) 
    call DzFrameShow(DzFrameFindByName("hero_weight_desc", 0), false) 
    call DzFrameShow(DzFrameFindByName("hero_weight_SSR_desc", 0), false)
    call DzFrameShow(DzFrameFindByName("hero_come_soon", 0), false)
    call DzFrameShow(DzFrameFindByName("hero_come_soon_desc", 0), false)
    call DzClickFrame(DzFrameFindByName("str_btn", 0))

    set Btn_Eff =  DzCreateFrameByTagName("SPRITE", "UI_eff", DzFrameFindByName("btn_buy", 0), "template", 0)
    call DzFrameSetPoint(Btn_Eff, 7, DzFrameFindByName("btn_buy", 0), 7, -0.01, 0.06)

    set Tip_Bg = DzCreateFrame("TIPBG", DzGetGameUI(), 0)
    
    set Tip_Text = DzCreateFrame("TipTextArea", Tip_Bg, 0)
    call DzFrameShow(Tip_Bg, false)
    call DzFrameSetScript(DzFrameFindByName("icon_skill_1", 0), 2, "BtnTipsOn", false)
    call DzFrameSetScript(DzFrameFindByName("icon_skill_1", 0), 3, "BtnTipsOff", false)
    call DzFrameSetScript(DzFrameFindByName("icon_skill_2", 0), 2, "BtnTipsOn", false)
    call DzFrameSetScript(DzFrameFindByName("icon_skill_2", 0), 3, "BtnTipsOff", false)
    call DzFrameSetScript(DzFrameFindByName("icon_skill_3", 0), 2, "BtnTipsOn", false)
    call DzFrameSetScript(DzFrameFindByName("icon_skill_3", 0), 3, "BtnTipsOff", false)

    set frame = DzFrameFindByName("btn_ban", 0)
    call DzFrameSetScript(frame, 1, "Item_Ban_Click", false)
    call DzFrameSetScript(frame, 2, "Ban_BtnTipsOn", false)
    call DzFrameSetScript(frame, 3, "BtnTipsOff", false)
    call DzFrameShow(frame, false)

    call DzFrameSetScript(DzFrameFindByName("btn_ban_Q", 0), 2, "Ban_Panel_TipsOn", false)
    call DzFrameSetScript(DzFrameFindByName("btn_ban_Q", 0), 3, "BtnTipsOff", false)

    call DzFrameSetScript(DzFrameFindByName("Btn_Show_BAN", 0), 1, "Ban_Panel_Show", false)
    call DzFrameSetScript(DzFrameFindByName("Btn_Hide_BAN", 0), 1, "Ban_Panel_Hide", false)
    call DzFrameShow(DzFrameFindByName("BAN_UI_BG", 0), false)

    call Init_BAN_Frame()

    call SetPlayerState( Player(11), PLAYER_STATE_RESOURCE_GOLD, 0 )
endfunction

//---------------调用DZ自定义界面-------end---------

function DZAPI_Trig_Init takes nothing returns nothing
    set HSTB = InitHashtable()
    set Choose_Item_ID[0] = 0
    set Choose_Item_ID[1] = 0
    set Choose_Item_ID[2] = 0
    set Choose_Item_ID[3] = 0

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 1 )
	call TriggerAddAction(trig, function DZAPI_InitData)
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 41 )
	call TriggerAddAction(trig, function DZAPI_Update_Player0_CSORE)
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 42 )
	call TriggerAddAction(trig, function DZAPI_Update_Player1_CSORE)
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 43 )
	call TriggerAddAction(trig, function DZAPI_Update_Player2_CSORE)
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 44 )
	call TriggerAddAction(trig, function DZAPI_Update_Player3_CSORE)
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 11 )
	call TriggerAddAction(trig, function DZAPI_Save_Player0_Data)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 12 )
	call TriggerAddAction(trig, function DZAPI_Save_Player1_Data)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 13 )
	call TriggerAddAction(trig, function DZAPI_Save_Player2_Data)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 14 )
	call TriggerAddAction(trig, function DZAPI_Save_Player3_Data)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 21 )
	call TriggerAddAction(trig, function DZAPI_Save_Player0_Skin_Piece)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 22 )
	call TriggerAddAction(trig, function DZAPI_Save_Player1_Skin_Piece)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 23 )
	call TriggerAddAction(trig, function DZAPI_Save_Player2_Skin_Piece)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 24 )
	call TriggerAddAction(trig, function DZAPI_Save_Player3_Skin_Piece)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 31 )
	call TriggerAddAction(trig, function DZAPI_Save_Abyss_Player_0)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 32 )
	call TriggerAddAction(trig, function DZAPI_Save_Abyss_Player_1)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 33 )
	call TriggerAddAction(trig, function DZAPI_Save_Abyss_Player_2)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 34 )
	call TriggerAddAction(trig, function DZAPI_Save_Abyss_Player_3)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 51 )
	call TriggerAddAction(trig, function DZAPI_Save_Act_Score_0)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 52 )
	call TriggerAddAction(trig, function DZAPI_Save_Act_Score_1)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 53 )
	call TriggerAddAction(trig, function DZAPI_Save_Act_Score_2)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 54 )
	call TriggerAddAction(trig, function DZAPI_Save_Act_Score_3)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 61 )
	call TriggerAddAction(trig, function DZAPI_Save_OpenGiftNum_0)
    set trig = null
    
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 62 )
	call TriggerAddAction(trig, function DZAPI_Save_OpenGiftNum_1)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 63 )
	call TriggerAddAction(trig, function DZAPI_Save_OpenGiftNum_2)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 64 )
	call TriggerAddAction(trig, function DZAPI_Save_OpenGiftNum_3)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 71 )
	call TriggerAddAction(trig, function DZAPI_Save_DotaTDSprStr_0)
    set trig = null
    
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 72 )
	call TriggerAddAction(trig, function DZAPI_Save_DotaTDSprStr_1)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 73 )
	call TriggerAddAction(trig, function DZAPI_Save_DotaTDSprStr_2)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 74 )
	call TriggerAddAction(trig, function DZAPI_Save_DotaTDSprStr_3)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 81 )
	call TriggerAddAction(trig, function DZAPI_Save_DotaTDSumStr_0)
    set trig = null
    
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 82 )
	call TriggerAddAction(trig, function DZAPI_Save_DotaTDSumStr_1)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 83 )
	call TriggerAddAction(trig, function DZAPI_Save_DotaTDSumStr_2)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 84 )
	call TriggerAddAction(trig, function DZAPI_Save_DotaTDSumStr_3)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 101 )
	call TriggerAddAction(trig, function DZAPI_Score_Cost_0)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 102 )
	call TriggerAddAction(trig, function DZAPI_Score_Cost_1)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 103 )
	call TriggerAddAction(trig, function DZAPI_Score_Cost_2)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 104 )
	call TriggerAddAction(trig, function DZAPI_Score_Cost_3)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 200 )
	call TriggerAddAction(trig, function Init_Rank_Damage)

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 201 )
	call TriggerAddAction(trig, function Init_Rank_Damage_Update)

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 202 )
	call TriggerAddAction(trig, function DZAPI_Rank_Damage_Destory)

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 301 )
	call TriggerAddAction(trig, function Trig_Init_Frame_TuJian)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 303 )
	call TriggerAddAction(trig, function Weight_UI_Choose_Update)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 306 )
	call TriggerAddAction(trig, function Show_Choose_Hero_0)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 307 )
	call TriggerAddAction(trig, function Show_Choose_Hero_1)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 308 )
	call TriggerAddAction(trig, function Show_Choose_Hero_2)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 309 )
	call TriggerAddAction(trig, function Show_Choose_Hero_3)
    set trig = null

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 400 )
	call TriggerAddAction(trig, function Trig_Init_Frame_Task)

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 401 )
	call TriggerAddAction(trig, function Reward_Show_Item)
    
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 403 )
	call TriggerAddAction(trig, function Reward_Show_Item)

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 404 )
	call TriggerAddAction(trig, function Reward_Can_Get_Item)

    set trig=CreateTrigger()
    call DzTriggerRegisterSyncData(trig, "ChooseHeroEnd", false)
    call TriggerAddAction(trig, function Trig_ChooseHeroAction)

    set trig=CreateTrigger()
    call DzTriggerRegisterSyncData(trig, "GoldRecord", false)
    call TriggerAddAction(trig, function DzAPI_Map_Global_UpdateGold_RecordString)

    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 901 )
	call TriggerAddAction(trig, function DZAPI_Score_Reset_0)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 902 )
	call TriggerAddAction(trig, function DZAPI_Score_Reset_1)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 903 )
	call TriggerAddAction(trig, function DZAPI_Score_Reset_2)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 904 )
	call TriggerAddAction(trig, function DZAPI_Score_Reset_3)
    set trig = null
    //打金记录查询和提交
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 1111 )
	call TriggerAddAction(trig, function DzAPI_Map_Global_SetGold_RecordString)
    set trig = null

    // set trig = CreateTrigger()
	// call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 1112 )
	// call TriggerAddAction(trig, function DzAPI_Map_Global_UpdateGold_RecordString)
    // set trig = null

    //积分商店买永久皮肤
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 1001 )
	call TriggerAddAction(trig, function DZAPI_Player0_Buy_Model)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 1002 )
	call TriggerAddAction(trig, function DZAPI_Player1_Buy_Model)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 1003 )
	call TriggerAddAction(trig, function DZAPI_Player2_Buy_Model)
    set trig = null
    set trig = CreateTrigger()
	call TriggerRegisterPlayerStateEvent(trig, Player(11), PLAYER_STATE_RESOURCE_GOLD, EQUAL, 1004 )
	call TriggerAddAction(trig, function DZAPI_Player3_Buy_Model)
    set trig = null

endfunction

function GotTimeRate takes nothing returns nothing
    local timer Timer
    set Timer = GetExpiredTimer()
    if(true == GetPlayerServerValueSuccess(Player(0))) then
        set isSuccessLoad_0 = 1
    else
        call DoNothing()
    endif
    if(true == GetPlayerServerValueSuccess(Player(1)) ) then
        set isSuccessLoad_1 = 1
    else
        call DoNothing()
    endif
    if(true == GetPlayerServerValueSuccess(Player(2) )) then
        set isSuccessLoad_2 = 1
    else
        call DoNothing()
    endif
    if(true == GetPlayerServerValueSuccess(Player(3)) ) then
        set isSuccessLoad_3 = 1
    else
        call DoNothing()
    endif
    if(1 == isSuccessLoad_0 and 1 == isSuccessLoad_1 and 1 == isSuccessLoad_2 and 1 == isSuccessLoad_3) then
        call DestroyTimer(Timer)
    else
        call DoNothing()
    endif
endfunction

function PlayerHasItem takes player whichPlayer,string name returns string
    if(true == DzAPI_Map_HasMallItem(whichPlayer, name)) then
        return name
    else
        return ""
    endif
endfunction

function CheckPlayerItem takes player whichPlayer returns nothing
    local integer i = 0
    local integer j = 0
    local string name
    local string item_name
    
    loop
        exitwhen null == Item_All_Shop[i]
        set name = Item_All_Shop[i]
        set item_name = PlayerHasItem(whichPlayer, name)
        if "SHOPITEM01" == item_name then
            set Has_VIP_Player[GetPlayerId(whichPlayer)] = true
        else
        endif
        if(whichPlayer == Player(0)) then
            set player_0_item[j] = item_name
            set j = j + 1
        elseif(whichPlayer == Player(1)) then
            set player_1_item[j] = item_name
            set j = j + 1
        elseif(whichPlayer == Player(2)) then
            set player_2_item[j] = item_name
            set j = j + 1
        elseif(whichPlayer == Player(3)) then
            set player_3_item[j] = item_name
            set j = j + 1
        endif
        set i = i + 1
    endloop
    
endfunction

function IninItemShop takes nothing returns nothing
    local integer i = 0
    set Item_All_Shop[i] = "DZACT01"
    set i = i + 1
    set Item_All_Shop[i] = "DZACT02"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM01"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM02"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM03"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM04"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM05"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM06"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM07"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM08"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM09"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM10"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM11"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM12"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM13"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM14"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM15"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM16"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM17"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM18"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM19"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM20"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM21"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM22"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM23"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM24"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM25"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM26"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM27"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM28"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM29"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM30"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM31"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM32"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM33"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM34"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM35"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM36"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM37"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM38"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM39"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM40"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM41"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM42"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM43"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM44"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM45"
    set i = i + 1
    set Item_All_Shop[i] = "SHOPITEM46"
    set i = i + 1 
endfunction

function ShopInit takes nothing returns nothing
    call IninItemShop()
    call CheckPlayerItem(Player(0))
    call CheckPlayerItem(Player(1))
    call CheckPlayerItem(Player(2))
    call CheckPlayerItem(Player(3))
endfunction

function IsGotSerData takes nothing returns nothing
    local timer Timer
    set Timer = CreateTimer()
    call TimerStart(Timer, 1, true, function GotTimeRate)
endfunction


function main takes nothing returns nothing
    call ShopInit()
    call Cheat("exec-lua:scripts.main")
    call DZAPI_Trig_Init()
    call IsGotSerData()
endfunction


function InitCustomPlayerSlots takes nothing returns nothing
	// Player 0
	call SetPlayerStartLocation(Player(0), 0)
    call ForcePlayerStartLocation(Player(0), 0)
    call SetPlayerColor(Player(0), ConvertPlayerColor(0))
    call SetPlayerRacePreference(Player(0), RACE_PREF_NIGHTELF)
    call SetPlayerRaceSelectable(Player(0), false)
    call SetPlayerController(Player(0), MAP_CONTROL_USER)
    // Player 1
    call SetPlayerStartLocation(Player(1), 1)
    call ForcePlayerStartLocation(Player(1), 1)
    call SetPlayerColor(Player(1), ConvertPlayerColor(1))
    call SetPlayerRacePreference(Player(1), RACE_PREF_NIGHTELF)
    call SetPlayerRaceSelectable(Player(1), false)
    call SetPlayerController(Player(1), MAP_CONTROL_USER)
    // Player 2
    call SetPlayerStartLocation(Player(2), 2)
    call ForcePlayerStartLocation(Player(2), 2)
    call SetPlayerColor(Player(2), ConvertPlayerColor(2))
    call SetPlayerRacePreference(Player(2), RACE_PREF_NIGHTELF)
    call SetPlayerRaceSelectable(Player(2), false)
    call SetPlayerController(Player(2), MAP_CONTROL_USER)
    // Player 3
    call SetPlayerStartLocation(Player(3), 3)
    call ForcePlayerStartLocation(Player(3), 3)
    call SetPlayerColor(Player(3), ConvertPlayerColor(3))
    call SetPlayerRacePreference(Player(3), RACE_PREF_NIGHTELF)
    call SetPlayerRaceSelectable(Player(3), false)
    call SetPlayerController(Player(3), MAP_CONTROL_USER)
    // Player 11
    call SetPlayerStartLocation(Player(11), 4)
    call ForcePlayerStartLocation(Player(11), 4)
    call SetPlayerColor(Player(11), ConvertPlayerColor(11))
    call SetPlayerRacePreference(Player(11), RACE_PREF_UNDEAD)
    call SetPlayerRaceSelectable(Player(11), false)
    call SetPlayerController(Player(11), MAP_CONTROL_COMPUTER)
endfunction
function InitCustomTeams takes nothing returns nothing
	// Force: TRIGSTR_010
	call SetPlayerTeam(Player(0), 0)
	call SetPlayerState(Player(0), PLAYER_STATE_ALLIED_VICTORY, 1)
	call SetPlayerTeam(Player(1), 0)
	call SetPlayerState(Player(1), PLAYER_STATE_ALLIED_VICTORY, 1)
	call SetPlayerTeam(Player(2), 0)
	call SetPlayerState(Player(2), PLAYER_STATE_ALLIED_VICTORY, 1)
	call SetPlayerTeam(Player(3), 0)
	call SetPlayerState(Player(3), PLAYER_STATE_ALLIED_VICTORY, 1)

	call SetPlayerAllianceStateAllyBJ(Player(0), Player(1), true)
    call SetPlayerAllianceStateAllyBJ(Player(0), Player(2), true)
    call SetPlayerAllianceStateAllyBJ(Player(0), Player(3), true)
    call SetPlayerAllianceStateAllyBJ(Player(1), Player(0), true)
    call SetPlayerAllianceStateAllyBJ(Player(1), Player(2), true)
    call SetPlayerAllianceStateAllyBJ(Player(1), Player(3), true)
    call SetPlayerAllianceStateAllyBJ(Player(2), Player(0), true)
    call SetPlayerAllianceStateAllyBJ(Player(2), Player(1), true)
    call SetPlayerAllianceStateAllyBJ(Player(2), Player(3), true)
    call SetPlayerAllianceStateAllyBJ(Player(3), Player(0), true)
    call SetPlayerAllianceStateAllyBJ(Player(3), Player(1), true)
    call SetPlayerAllianceStateAllyBJ(Player(3), Player(2), true)
    
    call SetPlayerAllianceStateVisionBJ(Player(0), Player(1), true)
    call SetPlayerAllianceStateVisionBJ(Player(0), Player(2), true)
    call SetPlayerAllianceStateVisionBJ(Player(0), Player(3), true)
    call SetPlayerAllianceStateVisionBJ(Player(1), Player(0), true)
    call SetPlayerAllianceStateVisionBJ(Player(1), Player(2), true)
    call SetPlayerAllianceStateVisionBJ(Player(1), Player(3), true)
    call SetPlayerAllianceStateVisionBJ(Player(2), Player(0), true)
    call SetPlayerAllianceStateVisionBJ(Player(2), Player(1), true)
    call SetPlayerAllianceStateVisionBJ(Player(2), Player(3), true)
    call SetPlayerAllianceStateVisionBJ(Player(3), Player(0), true)
    call SetPlayerAllianceStateVisionBJ(Player(3), Player(1), true)
    call SetPlayerAllianceStateVisionBJ(Player(3), Player(2), true)
	// Force: TRIGSTR_011
	call SetPlayerTeam(Player(11), 1)
	call SetPlayerState(Player(11), PLAYER_STATE_ALLIED_VICTORY, 1)
endfunction
function InitAllyPriorities takes nothing returns nothing
	call SetStartLocPrioCount(0, 3)
	call SetStartLocPrio(0, 0, 2, MAP_LOC_PRIO_HIGH)
	call SetStartLocPrio(0, 1, 3, MAP_LOC_PRIO_HIGH)
	call SetStartLocPrioCount(1, 1)
	call SetStartLocPrio(1, 0, 3, MAP_LOC_PRIO_HIGH)
	call SetStartLocPrioCount(2, 1)
	call SetStartLocPrio(2, 0, 0, MAP_LOC_PRIO_HIGH)
	call SetStartLocPrioCount(3, 2)
	call SetStartLocPrio(3, 0, 0, MAP_LOC_PRIO_LOW)
	call SetStartLocPrio(3, 1, 1, MAP_LOC_PRIO_HIGH)
endfunction



function config takes nothing returns nothing
    call SetMapName("刀圈TD")
	call SetMapDescription("")
	call SetPlayers(5)
	call SetTeams(5)
	call SetGamePlacement(MAP_PLACEMENT_TEAMS_TOGETHER)
	call DefineStartLocation(0, -2304.0000, 832.0000)
	call DefineStartLocation(1, 896.0000, 2304.0000)
	call DefineStartLocation(2, 2304.0000, -832.0000)
	call DefineStartLocation(3, -768.0000, -2304.0000)
	// Player setup
	call InitCustomPlayerSlots()
	call InitCustomTeams()
	call InitAllyPriorities()
endfunction
