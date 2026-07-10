export interface PlaybackState { currentTime:number; playing:boolean; mode:'track'|'segment'; segmentStart:number; segmentEnd:number }
export type PlaybackAction = {type:'toggle'}|{type:'play-segment'}|{type:'stop'}|{type:'tick';delta:number};
export function playbackReducer(state:PlaybackState,action:PlaybackAction):PlaybackState{
  if(action.type==='stop')return{...state,playing:false,mode:'track'};
  if(action.type==='play-segment')return{...state,currentTime:state.segmentStart,playing:true,mode:'segment'};
  if(action.type==='toggle'){const restart=state.mode==='segment'&&state.currentTime>=state.segmentEnd;return{...state,currentTime:restart?state.segmentStart:state.currentTime,playing:!state.playing};}
  if(!state.playing)return state;
  const next=state.currentTime+action.delta;
  if(state.mode==='segment'&&next>=state.segmentEnd)return{...state,currentTime:state.segmentEnd,playing:false};
  return{...state,currentTime:next};
}
