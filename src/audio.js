/** Entirely synthesized audio. No downloaded sound assets or audio trackers. */
export class Sound {
  constructor(settings){this.settings=settings;this.context=null;this.master=null;}
  unlock() {
    if(!this.settings.sound)return;
    try {
      if(!this.context) {
        const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return;
        this.context=new AC();this.master=this.context.createGain();this.master.connect(this.context.destination);
      }
      if(this.context.state==='suspended')this.context.resume().catch(()=>{});
      this.master.gain.setValueAtTime(this.settings.volume*.48,this.context.currentTime);
    }catch{/* Audio is optional, including under restrictive autoplay policies. */}
  }
  tone(freq,delay=0,duration=.14,type='sine',level=.35) {
    if(!this.settings.sound||!this.context||this.context.state!=='running')return;
    const t=this.context.currentTime+delay,osc=this.context.createOscillator(),gain=this.context.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.86),t+duration);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(level,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+duration+.03);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  play(name,index=0) {
    this.unlock();
    if(name==='step')this.tone([330,392,440,523][index%4],0,.1,'sine',.24);
    if(name==='back')this.tone(240,0,.09,'triangle',.12);
    if(name==='error')this.tone(110,0,.16,'triangle',.15);
    if(name==='select')this.tone(560,0,.065,'sine',.1);
    if(name==='connect')[440,554,659].forEach((v,i)=>this.tone(v,i*.065,.24,'sine',.18));
    if(name==='run')[220,330,440].forEach((v,i)=>this.tone(v,i*.1,.36,'sine',.15));
    if(name==='win')[392,494,587,784,988].forEach((v,i)=>this.tone(v,i*.12,.55,'sine',.16));
  }
  update(settings){this.settings=settings;if(this.master&&this.context)this.master.gain.setValueAtTime(settings.sound?settings.volume*.48:0,this.context.currentTime);}
  suspend(){this.context?.suspend().catch(()=>{});}
}
