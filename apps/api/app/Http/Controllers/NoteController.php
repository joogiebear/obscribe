<?php
namespace App\Http\Controllers;
use App\Models\Note;use App\Models\Notebook;use Illuminate\Http\Request;
class NoteController extends Controller{
public function index(Request $r,$id){$w=$r->user()->currentWorkspace();$n=Notebook::where('id',$id)->where('workspace_id',$w->id)->firstOrFail();return response()->json(['notes'=>Note::where('notebook_id',$n->id)->get()]);}
public function store(Request $r,$id){$w=$r->user()->currentWorkspace();$n=Notebook::where('id',$id)->where('workspace_id',$w->id)->firstOrFail();$note=Note::create(['notebook_id'=>$n->id,'content'=>'']);return response()->json($note,201);} 
public function update(Request $r,$id){$w=$r->user()->currentWorkspace();$note=Note::findOrFail($id);$n=Notebook::where('id',$note->notebook_id)->where('workspace_id',$w->id)->firstOrFail();$d=$r->validate(['content'=>['nullable','string']]);$note->update($d);return response()->json($note);} }
