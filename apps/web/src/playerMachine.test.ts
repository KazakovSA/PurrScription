import { describe, expect, it } from 'vitest';
import { playbackReducer, type PlaybackState } from './playerMachine';
const base:PlaybackState={currentTime:12,playing:false,mode:'track',segmentStart:10,segmentEnd:15};
describe('player state machine',()=>{
  it('starts the selected segment at its boundary',()=>{expect(playbackReducer(base,{type:'play-segment'})).toMatchObject({currentTime:10,playing:true,mode:'segment'})});
  it('stops exactly at segment end',()=>{const state={...base,currentTime:14.8,playing:true,mode:'segment' as const};expect(playbackReducer(state,{type:'tick',delta:.4})).toMatchObject({currentTime:15,playing:false,mode:'segment'})});
  it('keeps segment mode after pausing',()=>{const state={...base,playing:true,mode:'segment' as const};expect(playbackReducer(state,{type:'toggle'}).mode).toBe('segment')});
  it('escape-style stop exits segment mode',()=>{const state={...base,mode:'segment' as const};expect(playbackReducer(state,{type:'stop'}).mode).toBe('track')});
});
